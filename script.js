/* =====================================================
   PLANNER FINANCEIRO — script.js
   Dados 100% em localStorage. Sem backend.
===================================================== */

const LS_KEY = 'plannerFinanceiro_v1';

const CATEGORIA_ICONS_DEFAULT = [
  {nome:'Alimentação', emoji:'🍔'},
  {nome:'Transporte', emoji:'🚗'},
  {nome:'Compras', emoji:'🛍️'},
  {nome:'Casa', emoji:'🏠'},
  {nome:'Beleza', emoji:'💄'},
  {nome:'Lazer', emoji:'🎬'},
  {nome:'Estudos', emoji:'🎓'},
  {nome:'Pets', emoji:'🐶'},
  {nome:'Saúde', emoji:'❤️'},
  {nome:'Assinaturas', emoji:'📱'},
];
const CATEGORIA_RECEITA_DEFAULT = [
  {nome:'Salário', emoji:'💼'},
  {nome:'Freelance', emoji:'💻'},
  {nome:'Reembolso', emoji:'🔁'},
  {nome:'Investimentos', emoji:'📈'},
  {nome:'Outros', emoji:'✨'},
];

const ACCENT_COLORS = ['#F49AC1','#E4729E','#C9A15A','#B29DD9','#8FBFD9','#7FB08F'];

function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function defaultData(){
  return {
    config:{ nome:'Usuária', avatar:'🌸', moeda:'BRL', tema:'claro', cor: ACCENT_COLORS[0], onboarded:false },
    gastos:[],
    recebimentos:[],
    cartoes:[],
    categoriasGasto: CATEGORIA_ICONS_DEFAULT.map(c=>({id:uid(), ...c})),
    categoriasReceita: CATEGORIA_RECEITA_DEFAULT.map(c=>({id:uid(), ...c})),
    reserva:{ meta:20000, historico:[] },
    patrimonioInicial:{ dataInicio: todayISO(), saldoConta:0, reservaInicial:0, outros:[], faturasIniciais:{} },
  };
}

let DB = loadDB();

function loadDB(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const base = defaultData();
    return Object.assign(base, parsed, {
      config: Object.assign(base.config, parsed.config||{}),
      patrimonioInicial: Object.assign(base.patrimonioInicial, parsed.patrimonioInicial||{}),
    });
  }catch(e){
    console.error('Erro ao carregar dados', e);
    return defaultData();
  }
}

function saveDB(){
  localStorage.setItem(LS_KEY, JSON.stringify(DB));
}

/* ============ HELPERS ============ */
const MOEDA_SYMBOL = {BRL:'R$', USD:'$', EUR:'€'};

function fmtMoney(v){
  const symbol = MOEDA_SYMBOL[DB.config.moeda] || 'R$';
  const n = Number(v)||0;
  const abs = Math.abs(n).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  return (n<0? '-':'') + symbol + ' ' + abs;
}
function parseISO(d){ return new Date(d+'T00:00:00'); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function monthKey(dateStr){ return dateStr ? dateStr.slice(0,7) : ''; }
function monthLabel(key){
  const [y,m] = key.split('-').map(Number);
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[m-1]} de ${y}`;
}
function addMonths(key, delta){
  let [y,m] = key.split('-').map(Number);
  m += delta;
  while(m>12){m-=12;y++;}
  while(m<1){m+=12;y--;}
  return `${y}-${String(m).padStart(2,'0')}`;
}
function toast(msg, icon='fa-solid fa-heart'){
  const t = document.getElementById('toast');
  t.innerHTML = `<i class="${icon}"></i> ${msg}`;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>t.classList.remove('show'), 2600);
}
function catInfo(nome, tipo){
  const list = tipo==='receita' ? DB.categoriasReceita : DB.categoriasGasto;
  return list.find(c=>c.nome===nome) || {nome, emoji: tipo==='receita'?'✨':'🏷️'};
}

let currentDashMonth = todayISO().slice(0,7);
let currentCalMonth = todayISO().slice(0,7);

/* =====================================================
   NAVEGAÇÃO
===================================================== */
function initNav(){
  document.querySelectorAll('.nav-tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.nav-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('page-'+btn.dataset.page).classList.add('active');
      closeSidebarMobile();
      renderPage(btn.dataset.page);
    });
  });
  document.getElementById('menuBtn').addEventListener('click', ()=>{
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('show');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebarMobile);
}
function closeSidebarMobile(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

function renderPage(page){
  if(page==='dashboard') renderDashboard();
  if(page==='gastos') renderGastosPage();
  if(page==='recebimentos') renderRecebimentosPage();
  if(page==='cartoes') renderCartoesPage();
  if(page==='reserva') renderReservaPage();
  if(page==='graficos') renderGraficosPage();
  if(page==='calendario') renderCalendarioPage();
  if(page==='categorias') renderCategoriasPage();
  if(page==='configuracoes') renderConfigPage();
}

/* =====================================================
   CÁLCULOS FINANCEIROS
===================================================== */
function gastosDoMes(key){ return DB.gastos.filter(g=>monthKey(g.data)===key); }
function recebimentosDoMes(key){ return DB.recebimentos.filter(r=>monthKey(r.data)===key); }

function totalGastosMes(key){ return gastosDoMes(key).reduce((s,g)=>s+Number(g.valor),0); }
function totalRecebimentosMes(key){ return recebimentosDoMes(key).reduce((s,r)=>s+Number(r.valor),0); }

function saldoAteMes(key){
  // soma tudo até (e incluindo) o mês key, partindo do saldo inicial em conta cadastrado
  let saldo = (DB.patrimonioInicial && DB.patrimonioInicial.saldoConta) || 0;
  DB.recebimentos.forEach(r=>{ if(monthKey(r.data) <= key) saldo += Number(r.valor); });
  DB.gastos.forEach(g=>{ if(monthKey(g.data) <= key && g.forma!=='Crédito') saldo -= Number(g.valor); });
  // faturas de crédito entram no vencimento
  DB.gastos.forEach(g=>{ if(g.forma==='Crédito' && monthKey(g.vencimento||g.data) <= key) saldo -= Number(g.valor); });
  return saldo;
}

function totalFaturaCartaoMes(cartaoId, key){
  return DB.gastos.filter(g=>g.forma==='Crédito' && g.cartaoId===cartaoId && monthKey(g.vencimento||g.data)===key)
    .reduce((s,g)=>s+Number(g.valor),0);
}
function totalUsadoCartao(cartaoId){
  // soma de parcelas futuras/pendentes em aberto (aproximação: todas as parcelas não pagas)
  const dosGastos = DB.gastos.filter(g=>g.cartaoId===cartaoId && g.forma==='Crédito' && !g.pago)
    .reduce((s,g)=>s+Number(g.valor),0);
  const inicial = (DB.patrimonioInicial && DB.patrimonioInicial.faturasIniciais && DB.patrimonioInicial.faturasIniciais[cartaoId]) || 0;
  return dosGastos + inicial;
}
function outrosPatrimoniosTotal(){
  return ((DB.patrimonioInicial && DB.patrimonioInicial.outros) || []).reduce((s,o)=>s+Number(o.valor),0);
}
function patrimonioTotalAtual(key){
  return saldoAteMes(key) + reservaTotal() + outrosPatrimoniosTotal();
}
function contasPendentes(key){
  return DB.gastos.filter(g=> monthKey(g.vencimento||g.data)===key && !g.pago).length;
}
function economiaMes(key){
  return totalRecebimentosMes(key) - totalGastosMes(key);
}
function mediaEconomiaMensal(){
  const meses = new Set([...DB.gastos.map(g=>monthKey(g.data)), ...DB.recebimentos.map(r=>monthKey(r.data))]);
  if(meses.size===0) return 0;
  let total = 0;
  meses.forEach(m=> total += economiaMes(m));
  return total/meses.size;
}
function percentualRendaComprometida(key){
  const rec = totalRecebimentosMes(key);
  if(rec<=0) return 0;
  return Math.min(999, (totalGastosMes(key)/rec)*100);
}
function proximoVencimentoCartao(){
  if(DB.cartoes.length===0) return null;
  const hoje = new Date();
  let melhor = null;
  DB.cartoes.forEach(c=>{
    let venc = new Date(hoje.getFullYear(), hoje.getMonth(), Number(c.vencimento));
    if(venc < hoje) venc = new Date(hoje.getFullYear(), hoje.getMonth()+1, Number(c.vencimento));
    if(!melhor || venc < melhor.data) melhor = {nome:c.nome, data:venc};
  });
  return melhor;
}
function reservaTotal(){
  const base = (DB.patrimonioInicial && DB.patrimonioInicial.reservaInicial) || 0;
  return base + DB.reserva.historico.reduce((s,h)=>s+Number(h.valor),0);
}
function reservaGuardadaNoMes(key){
  return DB.reserva.historico.filter(h=>monthKey(h.data)===key).reduce((s,h)=>s+Number(h.valor),0);
}
function reservaMediaMensal(){
  const meses = new Set(DB.reserva.historico.map(h=>monthKey(h.data)));
  if(meses.size===0) return 0;
  return DB.reserva.historico.reduce((s,h)=>s+Number(h.valor),0)/meses.size;
}
function reservaRendimentoTotal(){
  return DB.reserva.historico.filter(h=>h.tipo==='rendimento').reduce((s,h)=>s+Number(h.valor),0);
}
function reservaRendimentoMes(key){
  return DB.reserva.historico.filter(h=>h.tipo==='rendimento' && monthKey(h.data)===key).reduce((s,h)=>s+Number(h.valor),0);
}
/* histórico "visível", incluindo o saldo inicial (se houver) como item fixo, não editável */
function reservaHistoricoVisivel(){
  const list = [...DB.reserva.historico];
  const inicial = (DB.patrimonioInicial && DB.patrimonioInicial.reservaInicial) || 0;
  if(inicial){
    list.push({ id:'__inicial__', tipo:'inicial', valor:inicial, desc:'Saldo inicial (patrimônio de partida)', data: DB.patrimonioInicial.dataInicio || todayISO(), virtual:true });
  }
  return list;
}

/* =====================================================
   DASHBOARD
===================================================== */
function renderDashboard(){
  document.getElementById('dashCurrentMonth').textContent = monthLabel(currentDashMonth);
  document.getElementById('dashMonthLabel').textContent = monthLabel(currentDashMonth);
  const key = currentDashMonth;

  const saldo = saldoAteMes(key);
  const totalReceb = totalRecebimentosMes(key);
  const totalGasto = totalGastosMes(key);
  const previstoFuturo = DB.gastos.filter(g=>monthKey(g.vencimento||g.data)===key && !g.pago).reduce((s,g)=>s+Number(g.valor),0);
  const totalFaturas = DB.cartoes.reduce((s,c)=>s+totalFaturaCartaoMes(c.id, key),0);
  const economia = economiaMes(key);
  const mediaEcon = mediaEconomiaMensal();
  const pctRenda = percentualRendaComprometida(key);
  const prontoVenc = proximoVencimentoCartao();
  const pendentes = contasPendentes(key);

  const cards = [
    {label: key===todayISO().slice(0,7) ? 'Saldo atual' : `Saldo até ${monthShort(key)}`, value:fmtMoney(saldo), icon:'fa-wallet', cls: saldo<0?'danger':'good'},
    {label:'Recebido no mês', value:fmtMoney(totalReceb), icon:'fa-sack-dollar', cls:'good'},
    {label:'Gasto no mês', value:fmtMoney(totalGasto), icon:'fa-bag-shopping', cls:'danger'},
    {label:'Previsto (pendente)', value:fmtMoney(previstoFuturo), icon:'fa-hourglass-half', cls:'warn'},
    {label:'Total em faturas', value:fmtMoney(totalFaturas), icon:'fa-credit-card', cls:'warn'},
    {label:'Economizado no mês', value:fmtMoney(economia), icon:'fa-piggy-bank', cls: economia<0?'danger':'good'},
    {label:'Média economizada/mês', value:fmtMoney(mediaEcon), icon:'fa-chart-line', cls:'good'},
    {label:'% da renda comprometida', value:pctRenda.toFixed(0)+'%', icon:'fa-gauge', cls: pctRenda>80?'danger':(pctRenda>50?'warn':'good')},
    {label:'Próx. vencimento cartão', value: prontoVenc? `${prontoVenc.nome} · ${prontoVenc.data.getDate()}/${prontoVenc.data.getMonth()+1}` : '—', icon:'fa-calendar-day', cls:''},
    {label:'Contas pendentes', value:pendentes, icon:'fa-list-check', cls: pendentes>0?'warn':'good'},
  ];
  if(outrosPatrimoniosTotal()>0){
    cards.push({label:'Outros patrimônios', value:fmtMoney(outrosPatrimoniosTotal()), icon:'fa-gem', cls:'good'});
  }

  document.getElementById('dashboardCards').innerHTML = cards.map(c=>`
    <div class="stat-card ${c.cls}">
      <span class="stat-icon"><i class="fa-solid ${c.icon}"></i></span>
      <span class="stat-label">${c.label}</span>
      <strong>${c.value}</strong>
    </div>`).join('');

  // últimos lançamentos (globais, não só do mês)
  const lancamentos = [
    ...DB.gastos.map(g=>({...g, tipo:'gasto'})),
    ...DB.recebimentos.map(r=>({...r, tipo:'receb', nome:r.descricao})),
  ].sort((a,b)=> b.data.localeCompare(a.data)).slice(0,8);

  document.getElementById('recentList').innerHTML = lancamentos.length ? lancamentos.map(l=>{
    const info = catInfo(l.categoria, l.tipo==='receb'?'receita':'gasto');
    return `<div class="recent-item">
      <div class="ri-left">
        <div class="ri-icon">${info.emoji}</div>
        <div>
          <p class="ri-title">${escapeHtml(l.nome)}</p>
          <p class="ri-sub">${formatDataBr(l.data)} · ${l.categoria||''}</p>
        </div>
      </div>
      <div class="ri-value ${l.tipo==='receb'?'pos':'neg'}">${l.tipo==='receb'?'+':'-'} ${fmtMoney(l.valor)}</div>
    </div>`;
  }).join('') : `<p class="empty-state">Nenhum lançamento ainda. Comece adicionando um gasto ou recebimento! 🌷</p>`;

  renderDashPie(key);
}

let chartDashPie;
function renderDashPie(key){
  const dados = {};
  gastosDoMes(key).forEach(g=>{ dados[g.categoria] = (dados[g.categoria]||0) + Number(g.valor); });
  const labels = Object.keys(dados);
  const values = Object.values(dados);
  const ctx = document.getElementById('chartDashPie');
  if(chartDashPie) chartDashPie.destroy();
  if(labels.length===0){ ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }
  chartDashPie = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data:values, backgroundColor: paletteFor(labels.length), borderWidth:2, borderColor:'#fff' }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{family:'Quicksand'} } } }, cutout:'62%' }
  });
}
function paletteFor(n){
  const base = [DB.config.cor, '#C9A15A','#B29DD9','#8FBFD9','#7FB08F','#E4729E','#EFC77A','#D9A7B2','#A98DC4','#F2C6D6']
    .filter((c,i,arr)=>arr.indexOf(c)===i);
  const out=[]; for(let i=0;i<n;i++) out.push(base[i%base.length]); return out;
}
document.getElementById('dashPrevMonth')?.addEventListener('click', ()=>{ currentDashMonth = addMonths(currentDashMonth,-1); renderDashboard(); });
document.getElementById('dashNextMonth')?.addEventListener('click', ()=>{ currentDashMonth = addMonths(currentDashMonth,1); renderDashboard(); });

function formatDataBr(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function escapeHtml(str){
  return String(str??'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

/* =====================================================
   GASTOS
===================================================== */
function populateGastoFilters(){
  const meses = [...new Set(DB.gastos.map(g=>monthKey(g.data)))].sort().reverse();
  const selMes = document.getElementById('filterGastoMes');
  selMes.innerHTML = '<option value="">Todos os meses</option>' + meses.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
  const selCat = document.getElementById('filterGastoCategoria');
  selCat.innerHTML = '<option value="">Todas categorias</option>' + DB.categoriasGasto.map(c=>`<option value="${c.nome}">${c.emoji} ${c.nome}</option>`).join('');
  const selCartao = document.getElementById('filterGastoCartao');
  selCartao.innerHTML = '<option value="">Todos cartões</option>' + DB.cartoes.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
}

function renderGastosPage(){
  populateGastoFilters();
  applyGastoFilters();
}
function applyGastoFilters(){
  const mes = document.getElementById('filterGastoMes').value;
  const cat = document.getElementById('filterGastoCategoria').value;
  const cartao = document.getElementById('filterGastoCartao').value;
  const forma = document.getElementById('filterGastoForma').value;
  const status = document.getElementById('filterGastoStatus').value;
  const busca = document.getElementById('filterGastoBusca').value.toLowerCase();

  let list = [...DB.gastos];
  if(mes) list = list.filter(g=>monthKey(g.data)===mes);
  if(cat) list = list.filter(g=>g.categoria===cat);
  if(cartao) list = list.filter(g=>g.cartaoId===cartao);
  if(forma) list = list.filter(g=>g.forma===forma);
  if(status) list = list.filter(g=> status==='pago' ? g.pago : !g.pago);
  if(busca) list = list.filter(g=> (g.nome+g.categoria+(g.obs||'')).toLowerCase().includes(busca));
  list.sort((a,b)=>b.data.localeCompare(a.data));

  const tbody = document.getElementById('gastosTableBody');
  document.getElementById('gastosEmpty').style.display = list.length? 'none':'block';
  tbody.innerHTML = list.map(g=>{
    const info = catInfo(g.categoria,'gasto');
    const cartaoNome = g.cartaoId ? (DB.cartoes.find(c=>c.id===g.cartaoId)?.nome || '') : '';
    return `<tr>
      <td><strong>${escapeHtml(g.nome)}</strong>${g.obs?`<br><small class="muted">${escapeHtml(g.obs)}</small>`:''}</td>
      <td><span class="tag-pill">${info.emoji} ${g.categoria}</span></td>
      <td>${formatDataBr(g.data)}</td>
      <td>${g.forma}${cartaoNome? ' · '+cartaoNome:''}</td>
      <td>${g.parcelas>1 ? `${g.parcelaAtual}/${g.parcelas}` : '—'}</td>
      <td><strong>${fmtMoney(g.valor)}</strong></td>
      <td><span class="status-pill ${g.pago?'pago':'pendente'}" style="cursor:pointer" onclick="toggleGastoPago('${g.id}')">${g.pago?'Pago':'Pendente'}</span></td>
      <td class="row-actions">
        <button class="icon-btn-sm" onclick="openGastoModal('${g.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn-sm" onclick="deleteGasto('${g.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}
['filterGastoMes','filterGastoCategoria','filterGastoCartao','filterGastoForma','filterGastoStatus','filterGastoBusca'].forEach(id=>{
  document.addEventListener('change', e=>{ if(e.target.id===id) applyGastoFilters(); });
  document.addEventListener('input', e=>{ if(e.target.id===id) applyGastoFilters(); });
});

function toggleGastoPago(id){
  const g = DB.gastos.find(x=>x.id===id); if(!g) return;
  g.pago = !g.pago; saveDB(); applyGastoFilters(); renderAlerts();
}
function deleteGasto(id, silent){
  const g = DB.gastos.find(x=>x.id===id);
  if(!silent && g && g.grupoParcelamento){
    if(confirm('Este gasto faz parte de um parcelamento. Deseja excluir TODAS as parcelas?')){
      DB.gastos = DB.gastos.filter(x=>x.grupoParcelamento!==g.grupoParcelamento);
    } else {
      DB.gastos = DB.gastos.filter(x=>x.id!==id);
    }
  } else {
    DB.gastos = DB.gastos.filter(x=>x.id!==id);
  }
  saveDB(); toast('Gasto removido','fa-solid fa-trash'); renderGastosPage(); renderAlerts();
}

function openGastoModal(id){
  const g = id ? DB.gastos.find(x=>x.id===id) : null;
  const catOptions = DB.categoriasGasto.map(c=>`<option value="${c.nome}" ${g?.categoria===c.nome?'selected':''}>${c.emoji} ${c.nome}</option>`).join('');
  const cartaoOptions = DB.cartoes.map(c=>`<option value="${c.id}" ${g?.cartaoId===c.id?'selected':''}>${c.nome}</option>`).join('');
  openModal(g?'Editar gasto':'Novo gasto', `
    <div class="form-group"><label>Nome da despesa</label><input type="text" id="fGastoNome" value="${g?escapeHtml(g.nome):''}" placeholder="Ex: Supermercado"></div>
    <div class="form-row">
      <div class="form-group"><label>Categoria</label><select id="fGastoCategoria">${catOptions}</select></div>
      <div class="form-group"><label>Valor</label><input type="number" step="0.01" id="fGastoValor" value="${g?g.valor:''}" placeholder="0,00"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Data da compra</label><input type="date" id="fGastoData" value="${g?g.data:todayISO()}"></div>
      <div class="form-group"><label>Forma de pagamento</label>
        <select id="fGastoForma">
          <option ${g?.forma==='Dinheiro'?'selected':''}>Dinheiro</option>
          <option ${g?.forma==='Pix'?'selected':''}>Pix</option>
          <option ${g?.forma==='Débito'?'selected':''}>Débito</option>
          <option ${g?.forma==='Crédito'?'selected':''}>Crédito</option>
        </select>
      </div>
    </div>
    <div id="fGastoCreditoWrap" style="display:${g?.forma==='Crédito'?'block':'none'}">
      <div class="form-row">
        <div class="form-group"><label>Cartão</label><select id="fGastoCartao"><option value="">Selecione</option>${cartaoOptions}</select></div>
        <div class="form-group"><label>Número de parcelas</label><input type="number" min="1" id="fGastoParcelas" value="${g?g.parcelas:1}" ${g?'disabled':''}></div>
      </div>
      ${g ? (g.parcelas>1 ? `<p class="muted" style="margin-top:-8px">Esta despesa faz parte de um parcelamento (${g.parcelaAtual}/${g.parcelas}). O número de parcelas não pode ser alterado por aqui — para refazer o parcelamento, exclua todas as parcelas e cadastre novamente.</p>` : '') : `
      <div class="form-group">
        <label>Parcela atual (use se a compra já está em andamento)</label>
        <input type="number" min="1" id="fGastoParcelaInicial" value="1">
      </div>
      <p class="muted" style="margin-top:-8px">Se for uma compra nova, deixe "1" — o campo "Valor" acima deve ser o valor total da compra. Se já está em andamento (ex: parcela 3 de 10), informe "3" e o campo "Valor" deve ser o valor de cada parcela.</p>`}
    </div>
    <div class="form-row">
      <div class="form-group"><label>Data de vencimento</label><input type="date" id="fGastoVencimento" value="${g?(g.vencimento||g.data):todayISO()}"></div>
      <div class="form-group" style="display:flex;align-items:flex-end;">
        <div class="checkbox-row" style="margin-bottom:12px;"><input type="checkbox" id="fGastoPago" ${g?.pago?'checked':''}><label style="margin:0">Já foi pago</label></div>
      </div>
    </div>
    <div class="form-group"><label>Observações</label><textarea id="fGastoObs">${g?escapeHtml(g.obs||''):''}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="width:auto" id="cancelGasto">Cancelar</button>
      <button class="btn btn-primary" id="saveGasto"><i class="fa-solid fa-check"></i> Salvar</button>
    </div>
  `);
  document.getElementById('fGastoForma').addEventListener('change', e=>{
    document.getElementById('fGastoCreditoWrap').style.display = e.target.value==='Crédito' ? 'block':'none';
  });
  document.getElementById('cancelGasto').addEventListener('click', closeModal);
  document.getElementById('saveGasto').addEventListener('click', ()=> saveGasto(id));
}
document.getElementById('addGastoBtn').addEventListener('click', ()=>openGastoModal(null));

function saveGasto(id){
  const nome = document.getElementById('fGastoNome').value.trim();
  const categoria = document.getElementById('fGastoCategoria').value;
  const valor = parseFloat(document.getElementById('fGastoValor').value);
  const data = document.getElementById('fGastoData').value;
  const forma = document.getElementById('fGastoForma').value;
  const cartaoId = document.getElementById('fGastoCartao') ? document.getElementById('fGastoCartao').value : '';
  const parcelas = forma==='Crédito' ? Math.max(1, parseInt(document.getElementById('fGastoParcelas').value)||1) : 1;
  const vencimento = document.getElementById('fGastoVencimento').value;
  const pago = document.getElementById('fGastoPago').checked;
  const obs = document.getElementById('fGastoObs').value.trim();

  if(!nome || !categoria || isNaN(valor) || !data){
    toast('Preencha os campos obrigatórios 🌷', 'fa-solid fa-triangle-exclamation'); return;
  }

  if(id){
    const g = DB.gastos.find(x=>x.id===id);
    Object.assign(g, {nome,categoria,valor,data,forma,cartaoId,vencimento,pago,obs});
    // não recalcula parcelamento em edição simples
  } else if(parcelas>1){
    const parcelaInicialEl = document.getElementById('fGastoParcelaInicial');
    const parcelaInicial = parcelaInicialEl ? Math.min(parcelas, Math.max(1, parseInt(parcelaInicialEl.value)||1)) : 1;
    const grupo = uid();
    // se a compra já está em andamento (parcela inicial > 1), o valor informado já é o valor de cada parcela
    const valorParcela = parcelaInicial>1 ? valor : Math.round((valor/parcelas)*100)/100;
    const restantes = parcelas - parcelaInicial + 1;
    for(let i=0;i<restantes;i++){
      const numeroParcela = parcelaInicial+i;
      const venc = addMonthsToDate(vencimento||data, i);
      DB.gastos.push({
        id:uid(), nome, categoria, valor:valorParcela, data, forma, cartaoId,
        parcelas, parcelaAtual:numeroParcela, vencimento:venc, pago: numeroParcela===parcelaInicial?pago:false, obs, grupoParcelamento:grupo
      });
    }
  } else {
    DB.gastos.push({id:uid(), nome, categoria, valor, data, forma, cartaoId, parcelas:1, parcelaAtual:1, vencimento, pago, obs});
  }
  saveDB(); closeModal(); toast('Gasto salvo com sucesso!'); renderGastosPage(); renderAlerts();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}
function addMonthsToDate(iso, delta){
  const d = parseISO(iso);
  d.setMonth(d.getMonth()+delta);
  return d.toISOString().slice(0,10);
}

/* =====================================================
   RECEBIMENTOS
===================================================== */
function populateRecFilters(){
  const meses = [...new Set(DB.recebimentos.map(r=>monthKey(r.data)))].sort().reverse();
  document.getElementById('filterRecMes').innerHTML = '<option value="">Todos os meses</option>' + meses.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
  document.getElementById('filterRecCategoria').innerHTML = '<option value="">Todas categorias</option>' + DB.categoriasReceita.map(c=>`<option value="${c.nome}">${c.emoji} ${c.nome}</option>`).join('');
}
function renderRecebimentosPage(){ populateRecFilters(); applyRecFilters(); }
function applyRecFilters(){
  const mes = document.getElementById('filterRecMes').value;
  const cat = document.getElementById('filterRecCategoria').value;
  const busca = document.getElementById('filterRecBusca').value.toLowerCase();
  let list = [...DB.recebimentos];
  if(mes) list = list.filter(r=>monthKey(r.data)===mes);
  if(cat) list = list.filter(r=>r.categoria===cat);
  if(busca) list = list.filter(r=>(r.descricao+r.categoria+(r.obs||'')).toLowerCase().includes(busca));
  list.sort((a,b)=>b.data.localeCompare(a.data));
  document.getElementById('recebimentosEmpty').style.display = list.length?'none':'block';
  document.getElementById('recebimentosTableBody').innerHTML = list.map(r=>{
    const info = catInfo(r.categoria,'receita');
    return `<tr>
      <td><strong>${escapeHtml(r.descricao)}</strong>${r.obs?`<br><small class="muted">${escapeHtml(r.obs)}</small>`:''}</td>
      <td><span class="tag-pill">${info.emoji} ${r.categoria}</span></td>
      <td>${formatDataBr(r.data)}</td>
      <td><strong>${fmtMoney(r.valor)}</strong></td>
      <td class="row-actions">
        <button class="icon-btn-sm" onclick="openRecModal('${r.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn-sm" onclick="deleteRec('${r.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}
['filterRecMes','filterRecCategoria','filterRecBusca'].forEach(id=>{
  document.addEventListener('change', e=>{ if(e.target.id===id) applyRecFilters(); });
  document.addEventListener('input', e=>{ if(e.target.id===id) applyRecFilters(); });
});
function deleteRec(id){
  if(!confirm('Tem certeza que deseja excluir este recebimento?')) return;
  DB.recebimentos = DB.recebimentos.filter(r=>r.id!==id);
  saveDB(); toast('Recebimento removido','fa-solid fa-trash'); renderRecebimentosPage(); renderAlerts();
}
function openRecModal(id){
  const r = id ? DB.recebimentos.find(x=>x.id===id) : null;
  const catOptions = DB.categoriasReceita.map(c=>`<option value="${c.nome}" ${r?.categoria===c.nome?'selected':''}>${c.emoji} ${c.nome}</option>`).join('');
  openModal(r?'Editar recebimento':'Novo recebimento', `
    <div class="form-group"><label>Descrição</label><input type="text" id="fRecDesc" value="${r?escapeHtml(r.descricao):''}" placeholder="Ex: Salário de julho"></div>
    <div class="form-row">
      <div class="form-group"><label>Categoria</label><select id="fRecCategoria">${catOptions}</select></div>
      <div class="form-group"><label>Valor</label><input type="number" step="0.01" id="fRecValor" value="${r?r.valor:''}"></div>
    </div>
    <div class="form-group"><label>Data</label><input type="date" id="fRecData" value="${r?r.data:todayISO()}"></div>
    <div class="form-group"><label>Observações</label><textarea id="fRecObs">${r?escapeHtml(r.obs||''):''}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="width:auto" id="cancelRec">Cancelar</button>
      <button class="btn btn-primary" id="saveRec"><i class="fa-solid fa-check"></i> Salvar</button>
    </div>
  `);
  document.getElementById('cancelRec').addEventListener('click', closeModal);
  document.getElementById('saveRec').addEventListener('click', ()=>saveRec(id));
}
document.getElementById('addRecebimentoBtn').addEventListener('click', ()=>openRecModal(null));
function saveRec(id){
  const descricao = document.getElementById('fRecDesc').value.trim();
  const categoria = document.getElementById('fRecCategoria').value;
  const valor = parseFloat(document.getElementById('fRecValor').value);
  const data = document.getElementById('fRecData').value;
  const obs = document.getElementById('fRecObs').value.trim();
  if(!descricao || isNaN(valor) || !data){ toast('Preencha os campos obrigatórios 🌷','fa-solid fa-triangle-exclamation'); return; }
  if(id){
    Object.assign(DB.recebimentos.find(x=>x.id===id), {descricao,categoria,valor,data,obs});
  } else {
    DB.recebimentos.push({id:uid(), descricao, categoria, valor, data, obs});
  }
  saveDB(); closeModal(); toast('Recebimento salvo com sucesso!'); renderRecebimentosPage(); renderAlerts();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

/* =====================================================
   CARTÕES
===================================================== */
function renderCartoesPage(){
  const key = currentDashMonth;
  document.getElementById('cartoesEmpty').style.display = DB.cartoes.length? 'none':'block';
  document.getElementById('cartoesGrid').innerHTML = DB.cartoes.map(c=>{
    const usado = totalUsadoCartao(c.id);
    const pct = c.limite>0 ? Math.min(100, (usado/c.limite)*100) : 0;
    const fatura = totalFaturaCartaoMes(c.id, key);
    return `<div class="cartao-card">
      <div class="cartao-actions">
        <button onclick="openCartaoModal('${c.id}')"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteCartao('${c.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
      <div class="cartao-top">
        <div>
          <p class="cartao-nome">${escapeHtml(c.nome)}</p>
          <p class="cartao-banco">${escapeHtml(c.banco||'')}</p>
        </div>
        <i class="fa-solid fa-credit-card" style="font-size:1.4rem;opacity:.8"></i>
      </div>
      <div>
        <div class="cartao-bar"><div class="cartao-bar-fill" style="width:${pct}%"></div></div>
        <div class="cartao-info"><span>Usado: ${fmtMoney(usado)}</span><span>Limite: ${fmtMoney(c.limite)}</span></div>
      </div>
      <div>
        <p class="cartao-fatura">${fmtMoney(fatura)} <small style="font-size:.65rem;opacity:.85">fatura do mês</small></p>
        <div class="cartao-info"><span>Melhor dia p/ compra: ${c.melhorDiaCompra}</span><span>Vence dia ${c.vencimento}</span></div>
      </div>
    </div>`;
  }).join('');
}
document.getElementById('addCartaoBtn').addEventListener('click', ()=>openCartaoModal(null));
function openCartaoModal(id){
  const c = id? DB.cartoes.find(x=>x.id===id): null;
  openModal(c?'Editar cartão':'Novo cartão', `
    <div class="form-group"><label>Nome do cartão</label><input type="text" id="fCartaoNome" value="${c?escapeHtml(c.nome):''}" placeholder="Ex: Nubank Roxinho"></div>
    <div class="form-group"><label>Banco</label><input type="text" id="fCartaoBanco" value="${c?escapeHtml(c.banco||''):''}" placeholder="Ex: Nubank"></div>
    <div class="form-group"><label>Limite</label><input type="number" step="0.01" id="fCartaoLimite" value="${c?c.limite:''}"></div>
    <div class="form-row">
      <div class="form-group"><label>Melhor dia para compra</label><input type="number" min="1" max="31" id="fCartaoMelhorDia" value="${c?c.melhorDiaCompra:1}"></div>
      <div class="form-group"><label>Dia de vencimento</label><input type="number" min="1" max="31" id="fCartaoVencimento" value="${c?c.vencimento:10}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="width:auto" id="cancelCartao">Cancelar</button>
      <button class="btn btn-primary" id="saveCartao"><i class="fa-solid fa-check"></i> Salvar</button>
    </div>
  `);
  document.getElementById('cancelCartao').addEventListener('click', closeModal);
  document.getElementById('saveCartao').addEventListener('click', ()=>saveCartao(id));
}
function saveCartao(id){
  const nome = document.getElementById('fCartaoNome').value.trim();
  const banco = document.getElementById('fCartaoBanco').value.trim();
  const limite = parseFloat(document.getElementById('fCartaoLimite').value)||0;
  const melhorDiaCompra = parseInt(document.getElementById('fCartaoMelhorDia').value)||1;
  const vencimento = parseInt(document.getElementById('fCartaoVencimento').value)||10;
  if(!nome){ toast('Informe o nome do cartão 🌷','fa-solid fa-triangle-exclamation'); return; }
  if(id){ Object.assign(DB.cartoes.find(x=>x.id===id), {nome,banco,limite,melhorDiaCompra,vencimento}); }
  else { DB.cartoes.push({id:uid(), nome, banco, limite, melhorDiaCompra, vencimento}); }
  saveDB(); closeModal(); toast('Cartão salvo!'); renderCartoesPage();
}
function deleteCartao(id){
  if(!confirm('Excluir este cartão? Os gastos vinculados a ele não serão apagados.')) return;
  DB.cartoes = DB.cartoes.filter(c=>c.id!==id);
  saveDB(); toast('Cartão removido','fa-solid fa-trash'); renderCartoesPage();
}

/* =====================================================
   RESERVA
===================================================== */
function renderReservaPage(){
  const total = reservaTotal();
  const meta = DB.reserva.meta||0;
  const pct = meta>0 ? Math.min(100, (total/meta)*100) : 0;
  document.getElementById('metaValor').textContent = fmtMoney(meta);
  document.getElementById('reservaAtual').textContent = fmtMoney(total);
  document.getElementById('locketPercent').textContent = pct.toFixed(0)+'%';
  const circumference = 2*Math.PI*60;
  const offset = circumference - (pct/100)*circumference;
  document.getElementById('locketCircle').style.strokeDasharray = circumference;
  document.getElementById('locketCircle').style.strokeDashoffset = offset;

  const key = currentDashMonth;
  document.getElementById('reservaMiniStats').innerHTML = `
    <div class="stat-card good">
      <span class="stat-label">Guardado este mês</span>
      <strong>${fmtMoney(reservaGuardadaNoMes(key))}</strong>
    </div>
    <div class="stat-card">
      <span class="stat-label">Média mensal guardada</span>
      <strong>${fmtMoney(reservaMediaMensal())}</strong>
    </div>
    <div class="stat-card good">
      <span class="stat-label">Rendimento do mês</span>
      <strong>${fmtMoney(reservaRendimentoMes(key))}</strong>
    </div>
    <div class="stat-card good">
      <span class="stat-label">Rendimento acumulado</span>
      <strong>${fmtMoney(reservaRendimentoTotal())}</strong>
    </div>
  `;

  if(!document.getElementById('reservaDataInput').value) document.getElementById('reservaDataInput').value = todayISO();

  const hist = reservaHistoricoVisivel().sort((a,b)=>b.data.localeCompare(a.data));
  document.getElementById('reservaHistorico').innerHTML = hist.length ? hist.map(h=>{
    const icon = h.tipo==='rendimento' ? 'fa-arrow-trend-up' : h.tipo==='inicial' ? 'fa-flag' : 'fa-piggy-bank';
    const label = h.tipo==='rendimento' ? 'Rendimento' : h.tipo==='inicial' ? 'Saldo inicial' : 'Aporte/retirada';
    return `<div class="recent-item">
      <div class="ri-left">
        <div class="ri-icon"><i class="fa-solid ${icon}"></i></div>
        <div><p class="ri-title">${escapeHtml(h.desc||label)}</p><p class="ri-sub">${label} · ${formatDataBr(h.data)}</p></div>
      </div>
      <div class="ri-value ${h.valor<0?'neg':'pos'}">${h.valor<0?'':'+'} ${fmtMoney(h.valor)}</div>
      ${h.virtual ? '' : `<button class="icon-btn-sm" onclick="deleteReservaMov('${h.id}')"><i class="fa-solid fa-trash"></i></button>`}
    </div>`;
  }).join('') : `<p class="empty-state">Nenhuma movimentação ainda. Comece guardando um valor! 💰</p>`;

  renderReservaChart();
}
function deleteReservaMov(id){
  if(!confirm('Tem certeza que deseja excluir esta movimentação?')) return;
  DB.reserva.historico = DB.reserva.historico.filter(h=>h.id!==id);
  saveDB(); toast('Movimentação removida','fa-solid fa-trash'); renderReservaPage();
}
document.getElementById('addReservaBtn').addEventListener('click', ()=>{
  const valor = parseFloat(document.getElementById('reservaValorInput').value);
  const desc = document.getElementById('reservaDescInput').value.trim();
  const tipo = document.getElementById('reservaTipoInput').value;
  const data = document.getElementById('reservaDataInput').value || todayISO();
  if(isNaN(valor)){ toast('Informe um valor válido 🌷','fa-solid fa-triangle-exclamation'); return; }
  DB.reserva.historico.push({id:uid(), valor, desc, data, tipo});
  saveDB();
  document.getElementById('reservaValorInput').value='';
  document.getElementById('reservaDescInput').value='';
  toast(tipo==='rendimento' ? 'Rendimento registrado!' : 'Movimentação registrada!');
  renderReservaPage(); renderAlerts();
});
document.getElementById('editMetaBtn').addEventListener('click', ()=>{
  openModal('Definir meta financeira', `
    <div class="form-group"><label>Valor da meta</label><input type="number" step="0.01" id="fMetaValor" value="${DB.reserva.meta||0}"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="width:auto" id="cancelMeta">Cancelar</button>
      <button class="btn btn-primary" id="saveMeta"><i class="fa-solid fa-check"></i> Salvar</button>
    </div>
  `);
  document.getElementById('cancelMeta').addEventListener('click', closeModal);
  document.getElementById('saveMeta').addEventListener('click', ()=>{
    DB.reserva.meta = parseFloat(document.getElementById('fMetaValor').value)||0;
    saveDB(); closeModal(); toast('Meta atualizada!'); renderReservaPage();
  });
});
let chartReserva;
function renderReservaChart(){
  const hist = reservaHistoricoVisivel().sort((a,b)=>a.data.localeCompare(b.data));
  let acumulado = 0;
  const labels = [], values = [];
  hist.forEach(h=>{ acumulado += Number(h.valor); labels.push(formatDataBr(h.data)); values.push(acumulado); });
  const ctx = document.getElementById('chartReserva');
  if(chartReserva) chartReserva.destroy();
  const accentRgb = hexToRgb(DB.config.cor);
  chartReserva = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ label:'Reserva acumulada', data:values, borderColor:DB.config.cor, backgroundColor:`rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},.15)`, fill:true, tension:.35 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true } } }
  });
}

/* =====================================================
   GRÁFICOS (página dedicada)
===================================================== */
let chartsRefs = {};
function destroyChart(name){ if(chartsRefs[name]){ chartsRefs[name].destroy(); delete chartsRefs[name]; } }

function renderGraficosPage(){
  // categoria (todos os tempos)
  const catData = {};
  DB.gastos.forEach(g=> catData[g.categoria] = (catData[g.categoria]||0)+Number(g.valor));
  destroyChart('cat');
  chartsRefs.cat = new Chart(document.getElementById('chartCategoria'), {
    type:'pie',
    data:{ labels:Object.keys(catData), datasets:[{data:Object.values(catData), backgroundColor:paletteFor(Object.keys(catData).length)}] },
    options:{ plugins:{legend:{position:'bottom'}} }
  });

  // últimos 6 meses
  const meses = lastNMonths(6);
  destroyChart('saldo');
  const saldoVals = meses.map(m=>saldoAteMes(m));
  chartsRefs.saldo = new Chart(document.getElementById('chartSaldo'), {
    type:'line',
    data:{ labels:meses.map(monthShort), datasets:[{label:'Saldo', data:saldoVals, borderColor:'#C9A15A', backgroundColor:'rgba(201,161,90,.15)', fill:true, tension:.35}] },
    options:{ plugins:{legend:{display:false}} }
  });

  destroyChart('rd');
  chartsRefs.rd = new Chart(document.getElementById('chartReceitaDespesa'), {
    type:'bar',
    data:{ labels:meses.map(monthShort), datasets:[
      {label:'Receitas', data:meses.map(m=>totalRecebimentosMes(m)), backgroundColor:'#7FB08F'},
      {label:'Despesas', data:meses.map(m=>totalGastosMes(m)), backgroundColor:'#E08A8A'},
    ]},
    options:{ plugins:{legend:{position:'bottom'}} }
  });

  destroyChart('econ');
  chartsRefs.econ = new Chart(document.getElementById('chartEconomia'), {
    type:'line',
    data:{ labels:meses.map(monthShort), datasets:[{label:'Economia', data:meses.map(m=>economiaMes(m)), borderColor:'#F49AC1', backgroundColor:'rgba(244,154,193,.2)', fill:true, tension:.35}] },
    options:{ plugins:{legend:{display:false}} }
  });

  destroyChart('cartaoChart');
  const cartaoLabels = DB.cartoes.map(c=>c.nome);
  const cartaoValues = DB.cartoes.map(c=>totalUsadoCartao(c.id));
  chartsRefs.cartaoChart = new Chart(document.getElementById('chartCartao'), {
    type:'bar',
    data:{ labels:cartaoLabels, datasets:[{label:'Em aberto', data:cartaoValues, backgroundColor:'#B29DD9'}] },
    options:{ plugins:{legend:{display:false}} }
  });

  destroyChart('patr');
  const patrVals = meses.map(m=> saldoAteMes(m) + reservaTotal() + outrosPatrimoniosTotal());
  chartsRefs.patr = new Chart(document.getElementById('chartPatrimonio'), {
    type:'line',
    data:{ labels:meses.map(monthShort), datasets:[{label:'Patrimônio', data:patrVals, borderColor:'#8FBFD9', backgroundColor:'rgba(143,191,217,.25)', fill:true, tension:.35}] },
    options:{ plugins:{legend:{display:false}} }
  });
}
function lastNMonths(n){
  const out = []; let k = todayISO().slice(0,7);
  for(let i=n-1;i>=0;i--) out.push(addMonths(k,-i));
  return out;
}
function monthShort(key){
  const [y,m]=key.split('-'); const nomes=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return nomes[Number(m)-1]+'/'+y.slice(2);
}

/* =====================================================
   CALENDÁRIO
===================================================== */
function renderCalendarioPage(){
  document.getElementById('calCurrentMonth').textContent = monthLabel(currentCalMonth);
  const [y,m] = currentCalMonth.split('-').map(Number);
  const firstDay = new Date(y, m-1, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayStr = todayISO();

  let html = '';
  for(let i=0;i<startWeekday;i++) html += `<div class="cal-day empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr===todayStr;
    const gastosDia = DB.gastos.filter(g=>(g.vencimento||g.data)===dateStr);
    const recebDia = DB.recebimentos.filter(r=>r.data===dateStr);
    let dots = '';
    if(gastosDia.length) dots += `<span class="cal-dot gasto"></span>`.repeat(Math.min(3,gastosDia.length));
    if(recebDia.length) dots += `<span class="cal-dot receb"></span>`.repeat(Math.min(3,recebDia.length));
    html += `<div class="cal-day ${isToday?'today':''}" onclick="openDayModal('${dateStr}')">
      <span class="cal-num">${d}</span>
      <div class="cal-dot-row">${dots}</div>
    </div>`;
  }
  document.getElementById('calendarGrid').innerHTML = html;
}
document.getElementById('calPrevMonth').addEventListener('click', ()=>{ currentCalMonth = addMonths(currentCalMonth,-1); renderCalendarioPage(); });
document.getElementById('calNextMonth').addEventListener('click', ()=>{ currentCalMonth = addMonths(currentCalMonth,1); renderCalendarioPage(); });

function openDayModal(dateStr){
  const gastosDia = DB.gastos.filter(g=>(g.vencimento||g.data)===dateStr);
  const recebDia = DB.recebimentos.filter(r=>r.data===dateStr);
  document.getElementById('dayModalTitle').textContent = formatDataBr(dateStr);
  let body = '';
  if(!gastosDia.length && !recebDia.length){
    body = `<p class="empty-state">Nenhum evento neste dia. 🌸</p>`;
  } else {
    gastosDia.forEach(g=>{
      body += `<div class="day-event"><span>${catInfo(g.categoria,'gasto').emoji} ${escapeHtml(g.nome)} ${g.parcelas>1?`(${g.parcelaAtual}/${g.parcelas})`:''}</span><strong style="color:var(--perigo)">- ${fmtMoney(g.valor)}</strong></div>`;
    });
    recebDia.forEach(r=>{
      body += `<div class="day-event"><span>${catInfo(r.categoria,'receita').emoji} ${escapeHtml(r.descricao)}</span><strong style="color:var(--sucesso)">+ ${fmtMoney(r.valor)}</strong></div>`;
    });
  }
  document.getElementById('dayModalBody').innerHTML = body;
  document.getElementById('dayModalOverlay').classList.add('show');
}
document.getElementById('dayModalCloseBtn').addEventListener('click', ()=>document.getElementById('dayModalOverlay').classList.remove('show'));
document.getElementById('dayModalOverlay').addEventListener('click', e=>{ if(e.target.id==='dayModalOverlay') e.currentTarget.classList.remove('show'); });

/* =====================================================
   CATEGORIAS
===================================================== */
function renderCategoriasPage(){
  const totalGasto = {};
  DB.gastos.forEach(g=> totalGasto[g.categoria] = (totalGasto[g.categoria]||0)+Number(g.valor));
  const totalReceita = {};
  DB.recebimentos.forEach(r=> totalReceita[r.categoria] = (totalReceita[r.categoria]||0)+Number(r.valor));

  const gastoCards = DB.categoriasGasto.map(c=>`
    <div class="categoria-card">
      <button class="categoria-del" onclick="deleteCategoria('${c.id}','gasto')"><i class="fa-solid fa-xmark"></i></button>
      <div class="categoria-emoji">${c.emoji}</div>
      <p class="categoria-nome">${escapeHtml(c.nome)}</p>
      <p class="categoria-total">${fmtMoney(totalGasto[c.nome]||0)} gastos</p>
    </div>`).join('');
  const receitaCards = DB.categoriasReceita.map(c=>`
    <div class="categoria-card">
      <button class="categoria-del" onclick="deleteCategoria('${c.id}','receita')"><i class="fa-solid fa-xmark"></i></button>
      <div class="categoria-emoji">${c.emoji}</div>
      <p class="categoria-nome">${escapeHtml(c.nome)}</p>
      <p class="categoria-total">${fmtMoney(totalReceita[c.nome]||0)} recebidos</p>
    </div>`).join('');

  document.getElementById('categoriasGrid').innerHTML = `
    <div style="grid-column:1/-1"><h3 style="font-family:'Fraunces',serif;font-weight:600;margin:0 0 4px">Categorias de gasto</h3></div>
    ${gastoCards}
    <div style="grid-column:1/-1;margin-top:10px"><h3 style="font-family:'Fraunces',serif;font-weight:600;margin:0 0 4px">Categorias de receita</h3></div>
    ${receitaCards}
  `;
}
function deleteCategoria(id, tipo){
  if(!confirm('Excluir esta categoria? Os lançamentos que já usam ela não serão apagados, só perdem o emoji na listagem.')) return;
  if(tipo==='gasto') DB.categoriasGasto = DB.categoriasGasto.filter(c=>c.id!==id);
  else DB.categoriasReceita = DB.categoriasReceita.filter(c=>c.id!==id);
  saveDB(); toast('Categoria removida','fa-solid fa-trash'); renderCategoriasPage();
}
document.getElementById('addCategoriaBtn').addEventListener('click', ()=>{
  openModal('Nova categoria', `
    <div class="form-group"><label>Tipo</label>
      <select id="fCatTipo"><option value="gasto">Gasto</option><option value="receita">Receita</option></select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Emoji</label><input type="text" id="fCatEmoji" maxlength="2" placeholder="🌷"></div>
      <div class="form-group"><label>Nome</label><input type="text" id="fCatNome" placeholder="Ex: Viagens"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="width:auto" id="cancelCat">Cancelar</button>
      <button class="btn btn-primary" id="saveCat"><i class="fa-solid fa-check"></i> Adicionar</button>
    </div>
  `);
  document.getElementById('cancelCat').addEventListener('click', closeModal);
  document.getElementById('saveCat').addEventListener('click', ()=>{
    const tipo = document.getElementById('fCatTipo').value;
    const emoji = document.getElementById('fCatEmoji').value.trim() || '🌷';
    const nome = document.getElementById('fCatNome').value.trim();
    if(!nome){ toast('Informe um nome 🌷','fa-solid fa-triangle-exclamation'); return; }
    const novo = {id:uid(), nome, emoji};
    if(tipo==='gasto') DB.categoriasGasto.push(novo); else DB.categoriasReceita.push(novo);
    saveDB(); closeModal(); toast('Categoria adicionada!'); renderCategoriasPage();
  });
});

/* =====================================================
   ALERTAS
===================================================== */
function renderAlerts(){
  const alerts = [];
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
  const em3dias = new Date(hoje); em3dias.setDate(em3dias.getDate()+3);

  DB.gastos.filter(g=>!g.pago).forEach(g=>{
    const venc = parseISO(g.vencimento||g.data);
    if(venc.getTime()===amanha.getTime()) alerts.push({tipo:'aviso', msg:`"${g.nome}" vence amanhã (${fmtMoney(g.valor)})`});
    else if(venc>=hoje && venc<=em3dias) alerts.push({tipo:'info', msg:`"${g.nome}" vence em breve, dia ${formatDataBr(g.vencimento||g.data)}`});
    else if(venc<hoje) alerts.push({tipo:'perigo', msg:`"${g.nome}" está atrasado desde ${formatDataBr(g.vencimento||g.data)}`});
  });

  DB.cartoes.forEach(c=>{
    const usado = totalUsadoCartao(c.id);
    if(c.limite>0 && usado/c.limite>=0.8) alerts.push({tipo:'aviso', msg:`Cartão ${c.nome} está com mais de 80% do limite usado`});
    const hojeDia = hoje.getDate();
    const diff = (c.vencimento - hojeDia + 31) % 31;
    if(diff<=3) alerts.push({tipo:'info', msg:`Fatura do cartão ${c.nome} vence em ${diff===0?'hoje':diff+' dia(s)'}`});
  });

  const key = todayISO().slice(0,7);
  if(totalGastosMes(key) > mediaEconomiaMensal() + totalRecebimentosMes(key) && totalRecebimentosMes(key)>0 && totalGastosMes(key) > totalRecebimentosMes(key)){
    alerts.push({tipo:'perigo', msg:'Os gastos deste mês ultrapassaram os recebimentos.'});
  }
  const meta = DB.reserva.meta||0;
  if(meta>0 && reservaTotal()>=meta) alerts.push({tipo:'sucesso', msg:'🎉 Meta financeira atingida! Parabéns!'});

  const badge = document.getElementById('alertsBadge');
  badge.textContent = alerts.length;
  badge.setAttribute('data-zero', alerts.length===0);

  document.getElementById('alertsList').innerHTML = alerts.length ? alerts.map(a=>`
    <div class="alert-item ${a.tipo}"><i class="fa-solid ${a.tipo==='sucesso'?'fa-circle-check':a.tipo==='perigo'?'fa-circle-exclamation':a.tipo==='aviso'?'fa-triangle-exclamation':'fa-circle-info'}"></i> <span>${a.msg}</span></div>
  `).join('') : `<p class="empty-state">Tudo tranquilo por aqui! 🌸</p>`;
}
document.getElementById('alertsBtn').addEventListener('click', ()=>{
  document.getElementById('alertsPanel').classList.toggle('show');
});
document.getElementById('closeAlertsBtn').addEventListener('click', ()=>document.getElementById('alertsPanel').classList.remove('show'));

/* =====================================================
   PESQUISA GLOBAL
===================================================== */
const searchInput = document.getElementById('globalSearch');
searchInput.addEventListener('input', ()=>{
  const q = searchInput.value.trim().toLowerCase();
  const box = document.getElementById('searchResults');
  if(!q){ box.classList.remove('show'); return; }
  const results = [];
  DB.gastos.forEach(g=>{ if((g.nome+g.categoria).toLowerCase().includes(q)) results.push({tipo:'Gasto', titulo:g.nome, sub:`${g.categoria} · ${formatDataBr(g.data)}`, page:'gastos'}); });
  DB.recebimentos.forEach(r=>{ if((r.descricao+r.categoria).toLowerCase().includes(q)) results.push({tipo:'Recebimento', titulo:r.descricao, sub:`${r.categoria} · ${formatDataBr(r.data)}`, page:'recebimentos'}); });
  DB.cartoes.forEach(c=>{ if((c.nome+c.banco).toLowerCase().includes(q)) results.push({tipo:'Cartão', titulo:c.nome, sub:c.banco, page:'cartoes'}); });
  [...DB.categoriasGasto, ...DB.categoriasReceita].forEach(c=>{ if(c.nome.toLowerCase().includes(q)) results.push({tipo:'Categoria', titulo:c.nome, sub:c.emoji, page:'categorias'}); });

  box.innerHTML = results.length ? results.slice(0,10).map(r=>`
    <div class="search-item" onclick="goToSearchResult('${r.page}')">
      <div><strong>${escapeHtml(r.titulo)}</strong><small>${escapeHtml(r.sub||'')}</small></div>
      <span class="tag-pill">${r.tipo}</span>
    </div>`).join('') : `<div class="search-empty">Nenhum resultado para "${escapeHtml(q)}"</div>`;
  box.classList.add('show');
});
function goToSearchResult(page){
  document.querySelector(`.nav-tab[data-page="${page}"]`).click();
  document.getElementById('searchResults').classList.remove('show');
  searchInput.value='';
}
document.addEventListener('click', e=>{
  if(!e.target.closest('.search-wrap')) document.getElementById('searchResults').classList.remove('show');
});

/* =====================================================
   MODAL GENÉRICO
===================================================== */
function openModal(title, bodyHtml){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('show'); }
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay') closeModal(); });

document.getElementById('quickAddBtn').addEventListener('click', ()=>{
  openModal('O que deseja adicionar?', `
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-secondary" onclick="closeModal();openGastoModal(null)"><i class="fa-solid fa-bag-shopping"></i> Novo gasto</button>
      <button class="btn btn-secondary" onclick="closeModal();openRecModal(null)"><i class="fa-solid fa-sack-dollar"></i> Novo recebimento</button>
      <button class="btn btn-secondary" onclick="closeModal();openCartaoModal(null)"><i class="fa-solid fa-credit-card"></i> Novo cartão</button>
    </div>
  `);
});

/* =====================================================
   CONFIGURAÇÕES
===================================================== */
function renderConfigPage(){
  document.getElementById('cfgNome').value = DB.config.nome;
  document.getElementById('cfgAvatar').value = DB.config.avatar;
  document.getElementById('cfgMoeda').value = DB.config.moeda;
  document.getElementById('cfgTema').value = DB.config.tema;
  document.getElementById('colorSwatches').innerHTML = ACCENT_COLORS.map(c=>`
    <div class="swatch ${DB.config.cor===c?'active':''}" style="background:${c}" data-color="${c}"></div>`).join('');
  document.querySelectorAll('.swatch').forEach(sw=>{
    sw.addEventListener('click', ()=>{
      document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('active'));
      sw.classList.add('active');
    });
  });
}
document.getElementById('cfgSaveBtn').addEventListener('click', ()=>{
  DB.config.nome = document.getElementById('cfgNome').value.trim() || 'Usuária';
  DB.config.avatar = document.getElementById('cfgAvatar').value.trim() || '🌸';
  DB.config.moeda = document.getElementById('cfgMoeda').value;
  DB.config.tema = document.getElementById('cfgTema').value;
  const activeSwatch = document.querySelector('.swatch.active');
  if(activeSwatch) DB.config.cor = activeSwatch.dataset.color;
  saveDB();
  applyConfigVisuals();
  toast('Configurações salvas!');
  renderPage(activePageId());
});
function applyConfigVisuals(){
  document.documentElement.setAttribute('data-theme', DB.config.tema);
  const shades = shadeAccent(DB.config.cor);
  document.documentElement.style.setProperty('--accent', shades.accent);
  document.documentElement.style.setProperty('--accent-dark', shades.dark);
  document.documentElement.style.setProperty('--accent-light', shades.light);
  document.documentElement.style.setProperty('--accent-lighter', shades.lighter);
  const rgb = hexToRgb(DB.config.cor);
  document.documentElement.style.setProperty('--accent-rgb', `${rgb.r},${rgb.g},${rgb.b}`);
  applyChartTheme();
  document.getElementById('sidebarUserName').textContent = DB.config.nome;
  document.getElementById('avatarPreview').textContent = DB.config.avatar;
  document.getElementById('themeToggleBtn').innerHTML = DB.config.tema==='escuro'
    ? '<i class="fa-solid fa-sun"></i> Modo claro' : '<i class="fa-solid fa-moon"></i> Modo escuro';
}
function applyChartTheme(){
  const style = getComputedStyle(document.documentElement);
  Chart.defaults.color = style.getPropertyValue('--texto-suave').trim() || '#9C7C8C';
  Chart.defaults.borderColor = style.getPropertyValue('--linha').trim() || '#F3DCE6';
  Chart.defaults.font.family = 'Quicksand';
}
function activePageId(){
  const active = document.querySelector('.nav-tab.active');
  return active ? active.dataset.page : 'dashboard';
}
function hexToRgb(hex){
  const m = hex.replace('#','');
  return { r: parseInt(m.substring(0,2),16), g: parseInt(m.substring(2,4),16), b: parseInt(m.substring(4,6),16) };
}
function rgbToHex(r,g,b){
  const h = n => Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
  return '#'+h(r)+h(g)+h(b);
}
function mixColor(hex, target, amount){
  const c = hexToRgb(hex);
  const r = c.r + (target.r-c.r)*amount;
  const g = c.g + (target.g-c.g)*amount;
  const b = c.b + (target.b-c.b)*amount;
  return rgbToHex(r,g,b);
}
function shadeAccent(hex){
  const white = {r:255,g:255,b:255}, black = {r:0,g:0,b:0};
  return {
    accent: hex,
    dark: mixColor(hex, black, 0.26),
    light: mixColor(hex, white, 0.5),
    lighter: mixColor(hex, white, 0.82),
  };
}
document.getElementById('themeToggleBtn').addEventListener('click', ()=>{
  DB.config.tema = DB.config.tema==='escuro' ? 'claro' : 'escuro';
  saveDB(); applyConfigVisuals();
  if(document.getElementById('page-configuracoes').classList.contains('active')){
    document.getElementById('cfgTema').value = DB.config.tema;
  }
  renderPage(activePageId());
});

/* --- backup json --- */
function doExportBackup(){
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `backup-planner-financeiro-${todayISO()}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Backup exportado!');
}
document.getElementById('exportBackupBtn').addEventListener('click', doExportBackup);
document.getElementById('cfgExportBackup').addEventListener('click', doExportBackup);
document.getElementById('cfgImportBackup').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      const data = JSON.parse(ev.target.result);
      DB = Object.assign(defaultData(), data);
      saveDB();
      toast('Backup importado com sucesso!');
      applyConfigVisuals();
      renderPage('dashboard');
      document.querySelector('.nav-tab[data-page="dashboard"]').click();
    }catch(err){ toast('Arquivo inválido 😢','fa-solid fa-triangle-exclamation'); }
  };
  reader.readAsText(file);
});

/* --- exportar CSV (Excel) --- */
document.getElementById('cfgExportExcel').addEventListener('click', ()=>{
  const rows = [['Nome','Categoria','Data','Forma','Cartao','Parcela','Valor','Vencimento','Status','Observacoes']];
  DB.gastos.forEach(g=>{
    const cartaoNome = g.cartaoId ? (DB.cartoes.find(c=>c.id===g.cartaoId)?.nome||'') : '';
    rows.push([g.nome, g.categoria, g.data, g.forma, cartaoNome, g.parcelas>1?`${g.parcelaAtual}/${g.parcelas}`:'', g.valor, g.vencimento||'', g.pago?'Pago':'Pendente', g.obs||'']);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`gastos-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(url);
  toast('Planilha exportada!');
});

/* --- exportar PDF (via impressão) --- */
document.getElementById('cfgExportPdf').addEventListener('click', ()=>{
  const key = currentDashMonth;
  const win = window.open('', '_blank');
  const linhas = DB.gastos.filter(g=>monthKey(g.data)===key).map(g=>`<tr><td>${g.nome}</td><td>${g.categoria}</td><td>${formatDataBr(g.data)}</td><td>${fmtMoney(g.valor)}</td><td>${g.pago?'Pago':'Pendente'}</td></tr>`).join('');
  win.document.write(`
    <html><head><title>Relatório financeiro — ${monthLabel(key)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;color:#5C3A4E;}
      h1{color:#E4729E;} table{width:100%;border-collapse:collapse;margin-top:16px;}
      th,td{padding:8px;border-bottom:1px solid #F3DCE6;text-align:left;font-size:13px;}
      .resumo{display:flex;gap:20px;margin-top:16px;flex-wrap:wrap;}
      .resumo div{background:#FCE4EC;padding:12px 16px;border-radius:12px;}
    </style></head><body>
    <h1>Relatório financeiro — ${monthLabel(key)}</h1>
    <p>Gerado por ${DB.config.nome} em ${formatDataBr(todayISO())}</p>
    <div class="resumo">
      <div><strong>Recebido:</strong> ${fmtMoney(totalRecebimentosMes(key))}</div>
      <div><strong>Gasto:</strong> ${fmtMoney(totalGastosMes(key))}</div>
      <div><strong>Economia:</strong> ${fmtMoney(economiaMes(key))}</div>
      <div><strong>Saldo:</strong> ${fmtMoney(saldoAteMes(key))}</div>
    </div>
    <table><thead><tr><th>Despesa</th><th>Categoria</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>
    </body></html>`);
  win.document.close();
  setTimeout(()=>win.print(), 400);
});

/* --- patrimônio inicial --- */
function outroRowHtml(nome='', valor=''){
  return `<div class="form-row outro-row" style="margin-bottom:10px">
    <input type="text" class="outro-nome" placeholder="Ex: Carro, poupança em outro banco..." value="${escapeHtml(nome)}">
    <div style="display:flex;gap:8px">
      <input type="number" step="0.01" class="outro-valor" placeholder="Valor" value="${valor}">
      <button class="icon-btn-sm" onclick="this.closest('.outro-row').remove()"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>`;
}
function openPatrimonioModal(){
  const p = DB.patrimonioInicial;
  const cartoesHtml = DB.cartoes.length ? DB.cartoes.map(c=>`
    <div class="form-group">
      <label>Fatura em aberto hoje — ${escapeHtml(c.nome)}</label>
      <input type="number" step="0.01" class="fatura-inicial-input" data-cartao-id="${c.id}" value="${(p.faturasIniciais&&p.faturasIniciais[c.id])||0}">
    </div>`).join('') : `<p class="muted">Você ainda não cadastrou nenhum cartão.</p>`;

  openModal('Patrimônio inicial', `
    <p class="muted" style="margin-top:-6px">Estes valores representam o que você já tinha <strong>antes</strong> de começar a usar o app — eles não entram como gastos ou recebimentos do dia a dia, apenas como ponto de partida dos indicadores.</p>
    <div class="form-group"><label>Data de início de uso do sistema</label><input type="date" id="fPatrimonioData" value="${p.dataInicio||todayISO()}"></div>
    <div class="form-row">
      <div class="form-group"><label>Saldo já disponível em conta</label><input type="number" step="0.01" id="fPatrimonioSaldoConta" value="${p.saldoConta||0}"></div>
      <div class="form-group"><label>Reserva / investimentos já guardados</label><input type="number" step="0.01" id="fPatrimonioReserva" value="${p.reservaInicial||0}"></div>
    </div>

    <h4 style="margin:16px 0 8px;font-size:.9rem">Faturas de cartão já em aberto</h4>
    <div id="patrimonioCartoesWrap">${cartoesHtml}</div>

    <h4 style="margin:16px 0 8px;font-size:.9rem">Outros patrimônios (imóveis, veículos, outras contas...)</h4>
    <div id="patrimonioOutrosWrap">${(p.outros||[]).map(o=>outroRowHtml(o.nome,o.valor)).join('')}</div>
    <button class="btn btn-secondary" style="width:auto;margin-bottom:14px" id="addOutroBtn"><i class="fa-solid fa-plus"></i> Adicionar item</button>

    <div class="modal-actions">
      <button class="btn btn-secondary" style="width:auto" id="cancelPatrimonio">Cancelar</button>
      <button class="btn btn-primary" id="savePatrimonio"><i class="fa-solid fa-check"></i> Salvar</button>
    </div>
  `);
  document.getElementById('addOutroBtn').addEventListener('click', ()=>{
    document.getElementById('patrimonioOutrosWrap').insertAdjacentHTML('beforeend', outroRowHtml());
  });
  document.getElementById('cancelPatrimonio').addEventListener('click', closeModal);
  document.getElementById('savePatrimonio').addEventListener('click', savePatrimonioInicial);
}
function savePatrimonioInicial(){
  const dataInicio = document.getElementById('fPatrimonioData').value || todayISO();
  const saldoConta = parseFloat(document.getElementById('fPatrimonioSaldoConta').value)||0;
  const reservaInicial = parseFloat(document.getElementById('fPatrimonioReserva').value)||0;

  const faturasIniciais = {};
  document.querySelectorAll('.fatura-inicial-input').forEach(inp=>{
    const v = parseFloat(inp.value)||0;
    if(v) faturasIniciais[inp.dataset.cartaoId] = v;
  });

  const outros = [];
  document.querySelectorAll('#patrimonioOutrosWrap .outro-row').forEach(row=>{
    const nome = row.querySelector('.outro-nome').value.trim();
    const valor = parseFloat(row.querySelector('.outro-valor').value)||0;
    if(nome) outros.push({id:uid(), nome, valor});
  });

  DB.patrimonioInicial = { dataInicio, saldoConta, reservaInicial, faturasIniciais, outros };
  saveDB();
  closeModal();
  toast('Patrimônio inicial atualizado!');
  renderDashboard();
  if(document.getElementById('page-reserva').classList.contains('active')) renderReservaPage();
  if(document.getElementById('page-cartoes').classList.contains('active')) renderCartoesPage();
}
document.getElementById('editPatrimonioBtn').addEventListener('click', openPatrimonioModal);

document.getElementById('cfgResetAll').addEventListener('click', ()=>{
  if(!confirm('Tem certeza? Isso apagará TODOS os dados salvos neste navegador.')) return;
  localStorage.removeItem(LS_KEY);
  DB = defaultData();
  saveDB();
  toast('Dados apagados. Começando do zero! 🌱');
  applyConfigVisuals();
  document.querySelector('.nav-tab[data-page="dashboard"]').click();
  renderPage('dashboard');
});

/* =====================================================
   WELCOME / ONBOARDING
===================================================== */
function initWelcome(){
  if(DB.config.onboarded){
    document.getElementById('welcomeOverlay').classList.add('hidden');
    return;
  }
  document.getElementById('welcomeOverlay').classList.remove('hidden');
  document.getElementById('welcomeStart').addEventListener('click', ()=>{
    const nome = document.getElementById('welcomeName').value.trim();
    DB.config.nome = nome || 'Usuária';
    DB.config.moeda = document.getElementById('welcomeCurrency').value;
    DB.config.onboarded = true;
    saveDB();
    document.getElementById('welcomeOverlay').classList.add('hidden');
    applyConfigVisuals();
    renderAll();
  });
}

/* =====================================================
   INIT
===================================================== */
function renderAll(){
  renderDashboard();
  renderAlerts();
}

function init(){
  initNav();
  applyConfigVisuals();
  initWelcome();
  renderAll();
}
init();
