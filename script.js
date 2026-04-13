// ========== CONFIGURAÇÃO ==========
const API_URL = 'http://localhost:8000';

// Estado global
let paginaAtual = 'dashboard';
let carrinho = [];
let produtos = [];
let clientes = [];
let deferredPrompt = null;
let modoOffline = false;

// Cache para modo offline
let cacheProdutos = [];
let cacheClientes = [];
let cacheVendas = [];

// ========== FUNÇÕES AUXILIARES ==========

function formatarMoeda(valor) {
    if (valor === undefined || valor === null || isNaN(valor)) {
        console.warn('formatarMoeda recebeu valor inválido:', valor);
        return 'R$ 0,00';
    }
    return 'R$ ' + parseFloat(valor).toFixed(2).replace('.', ',');
}

function mostrarAlerta(mensagem, tipo = 'sucesso') {
    const alerta = document.createElement('div');
    alerta.className = `alerta alerta-${tipo}`;
    alerta.textContent = mensagem;
    document.body.appendChild(alerta);
    setTimeout(() => alerta.remove(), 3000);
}

function atualizarDataHora() {
    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR');
    const elem = document.getElementById('dataHora');
    if (elem) elem.textContent = dataStr;
}

// ========== FUNÇÕES DE API COM SUPORTE A OFFLINE ==========

async function apiGet(endpoint) {
    try {
        const resp = await fetch(`${API_URL}${endpoint}`);
        const dados = await resp.json();
        // Salvar no cache
        localStorage.setItem(`cache_${endpoint}`, JSON.stringify(dados));
        modoOffline = false;
        document.getElementById('statusOffline').style.display = 'none';
        return dados;
    } catch (error) {
        console.log('Modo offline - usando cache');
        modoOffline = true;
        document.getElementById('statusOffline').style.display = 'block';
        
        // Tentar pegar do cache
        const cache = localStorage.getItem(`cache_${endpoint}`);
        if (cache) {
            return JSON.parse(cache);
        }
        return [];
    }
}

async function apiPost(endpoint, data) {
    try {
        const resp = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const resultado = await resp.json();
        
        // Atualizar cache após operação
        await atualizarCache();
        
        return resultado;
    } catch (error) {
        mostrarAlerta('Sem conexão! Venda salva localmente.', 'erro');
        
        // Salvar venda localmente para sincronizar depois
        const vendasPendentes = JSON.parse(localStorage.getItem('vendas_pendentes') || '[]');
        vendasPendentes.push({ endpoint, data, timestamp: new Date().toISOString() });
        localStorage.setItem('vendas_pendentes', JSON.stringify(vendasPendentes));
        
        return { mensagem: 'Venda salva localmente', pendente: true };
    }
}

async function atualizarCache() {
    try {
        const produtosResp = await fetch(`${API_URL}/produtos`);
        cacheProdutos = await produtosResp.json();
        localStorage.setItem('cache_produtos', JSON.stringify(cacheProdutos));
        
        const clientesResp = await fetch(`${API_URL}/clientes`);
        cacheClientes = await clientesResp.json();
        localStorage.setItem('cache_clientes', JSON.stringify(cacheClientes));
    } catch (error) {
        // Usar cache existente
        cacheProdutos = JSON.parse(localStorage.getItem('cache_produtos') || '[]');
        cacheClientes = JSON.parse(localStorage.getItem('cache_clientes') || '[]');
    }
}

// ========== CARREGAR DADOS ==========

async function carregarProdutos() {
    try {
        const resp = await fetch(`${API_URL}/produtos`);
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        produtos = await resp.json();
        localStorage.setItem('cache_produtos', JSON.stringify(produtos));
        return produtos;
    } catch (error) {
        console.error('Erro ao carregar produtos da API:', error);
        produtos = JSON.parse(localStorage.getItem('cache_produtos') || '[]');
        return produtos;
    }
}

async function carregarClientes() {
    try {
        const resp = await fetch(`${API_URL}/clientes`);
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        clientes = await resp.json();
        localStorage.setItem('cache_clientes', JSON.stringify(clientes));
        return clientes;
    } catch (error) {
        console.error('Erro ao carregar clientes da API:', error);
        clientes = JSON.parse(localStorage.getItem('cache_clientes') || '[]');
        return clientes;
    }
}

// Carregar Produtos e Clientes em paralelo
async function carregarDadosEmParalelo() {
    return Promise.all([carregarProdutos(), carregarClientes()]);
}

// ========== PÁGINA DASHBOARD ==========

async function renderDashboard() {
    let dados;
    try {
        const resp = await fetch(`${API_URL}/resumo`);
        dados = await resp.json();
        localStorage.setItem('cache_resumo', JSON.stringify(dados));
    } catch (error) {
        dados = JSON.parse(localStorage.getItem('cache_resumo') || '{"vendas_hoje":0,"qtd_vendas_hoje":0,"total_produtos":0,"total_clientes":0,"total_dividas":0,"mais_vendidos":[],"ultimas_vendas":[]}');
    }
    
    const html = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="emoji">💰</div>
                <div class="valor">${formatarMoeda(dados.vendas_hoje)}</div>
                <div class="label">Vendas Hoje</div>
            </div>
            <div class="stat-card">
                <div class="emoji">📦</div>
                <div class="valor">${dados.total_produtos}</div>
                <div class="label">Itens em Estoque</div>
            </div>
            <div class="stat-card">
                <div class="emoji">👥</div>
                <div class="valor">${dados.total_clientes}</div>
                <div class="label">Clientes</div>
            </div>
            <div class="stat-card">
                <div class="emoji">📝</div>
                <div class="valor">${formatarMoeda(dados.total_dividas)}</div>
                <div class="label">Em Fiado</div>
            </div>
        </div>
        
        <div class="card">
            <h2>🏆 Produtos Mais Vendidos</h2>
            <canvas id="graficoProdutos" height="200"></canvas>
        </div>
        
        <div class="card">
            <h2>🔄 Últimas Vendas</h2>
            <div class="table-container">
                <table>
                    <thead>
                        <tr><th>Data</th><th>Cliente</th><th>Total</th><th>Tipo</th></tr>
                    </thead>
                    <tbody>
                        ${dados.ultimas_vendas.map(v => `
                            <tr>
                                <td>${new Date(v.data).toLocaleDateString('pt-BR')}</td>
                                <td>${v.cliente_nome}</td>
                                <td>${formatarMoeda(v.total)}</td>
                                <td>${v.tipo === 'fiado' ? '📝 Fiado' : '💰 À vista'}</td>
                            </tr>
                        `).join('')}
                        ${dados.ultimas_vendas.length === 0 ? '<tr><td colspan="4" style="text-align:center">Nenhuma venda ainda</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.getElementById('conteudo').innerHTML = html;
    
    if (dados.mais_vendidos && dados.mais_vendidos.length > 0) {
        const ctx = document.getElementById('graficoProdutos').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dados.mais_vendidos.map(m => m.nome),
                datasets: [{
                    label: 'Quantidade Vendida',
                    data: dados.mais_vendidos.map(m => m.quantidade),
                    backgroundColor: '#4CAF50',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } }
            }
        });
    }
}

// ========== PÁGINA DE VENDAS ==========

async function renderVendas() {
    await carregarDadosEmParalelo();
    
    // Garantir que todos os clientes e produtos têm os campos necessários
    const clientesSeguros = clientes.map(c => ({
        id: c.id || 0,
        nome: c.nome || 'N/A',
        telefone: c.telefone || '',
        limite_fiado: c.limite_fiado || 0,
        divida: c.divida || 0
    }));
    
    const produtosSeguros = produtos.map(p => ({
        id: p.id || 0,
        nome: p.nome || 'N/A',
        preco: p.preco || 0,
        estoque: p.estoque || 0
    }));
    
    const html = `
        <div class="card">
            <h2>💰 Nova Venda</h2>
            
            <div class="form-group">
                <label>👤 Cliente (opcional para fiado)</label>
                <select id="clienteVenda">
                    <option value="">Consumidor Final</option>
                    ${clientesSeguros.map(c => `<option value="${c.id}" data-divida="${c.divida}" data-limite="${c.limite_fiado}">${c.nome} (Limite: ${formatarMoeda(c.limite_fiado)} | Deve: ${formatarMoeda(c.divida)})</option>`).join('')}
                </select>
            </div>
            
            <div class="form-group">
                <label>➕ Adicionar Produto</label>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <select id="produtoSelecionado" style="flex: 2">
                        <option value="">Selecione um produto</option>
                        ${produtosSeguros.map(p => `<option value="${p.id}" data-preco="${p.preco}" data-estoque="${p.estoque}">${p.nome} - ${formatarMoeda(p.preco)} (${p.estoque} und)</option>`).join('')}
                    </select>
                    <input type="number" id="quantidade" value="1" min="1" style="width: 80px">
                    <button class="btn btn-primary" onclick="adicionarAoCarrinho()">➕ Adicionar</button>
                </div>
            </div>
            
            <div id="carrinhoItens"></div>
            <div class="total-carrinho" id="totalCarrinho">Total: R$ 0,00</div>
            
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button class="btn btn-primary" style="flex:1" onclick="finalizarVenda('avista')">✅ Finalizar (à vista)</button>
                <button class="btn btn-warning" style="flex:1" onclick="finalizarVenda('fiado')">📝 Vender Fiado</button>
            </div>
        </div>
    `;
    
    document.getElementById('conteudo').innerHTML = html;
    atualizarCarrinho();
}

function adicionarAoCarrinho() {
    const select = document.getElementById('produtoSelecionado');
    const produtoId = parseInt(select.value);
    const quantidade = parseInt(document.getElementById('quantidade').value);
    
    if (!produtoId) {
        mostrarAlerta('Selecione um produto!', 'erro');
        return;
    }
    
    const produto = produtos.find(p => p.id === produtoId);
    
    if (quantidade > produto.estoque) {
        mostrarAlerta(`Estoque insuficiente! Temos ${produto.estoque} unidades.`, 'erro');
        return;
    }
    
    const existente = carrinho.find(item => item.produto_id === produtoId);
    
    if (existente) {
        if (existente.quantidade + quantidade > produto.estoque) {
            mostrarAlerta('Estoque insuficiente!', 'erro');
            return;
        }
        existente.quantidade += quantidade;
    } else {
        carrinho.push({
            produto_id: produtoId,
            nome: produto.nome,
            preco: produto.preco,
            quantidade: quantidade
        });
    }
    
    atualizarCarrinho();
    document.getElementById('quantidade').value = 1;
}

function atualizarCarrinho() {
    const container = document.getElementById('carrinhoItens');
    const total = carrinho.reduce((s, i) => s + (i.preco * i.quantidade), 0);
    
    if (carrinho.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666;">Carrinho vazio</p>';
    } else {
        container.innerHTML = carrinho.map((item, idx) => `
            <div class="carrinho-item">
                <div class="carrinho-item-info">
                    <div class="carrinho-item-nome">${item.nome}</div>
                    <div class="carrinho-item-preco">${formatarMoeda(item.preco)} x ${item.quantidade} = ${formatarMoeda(item.preco * item.quantidade)}</div>
                </div>
                <button class="carrinho-item-remove" onclick="removerDoCarrinho(${idx})">✖</button>
            </div>
        `).join('');
    }
    
    document.getElementById('totalCarrinho').innerHTML = `Total: ${formatarMoeda(total)}`;
}

function removerDoCarrinho(index) {
    carrinho.splice(index, 1);
    atualizarCarrinho();
}

async function finalizarVenda(tipo) {
    if (carrinho.length === 0) {
        mostrarAlerta('Adicione itens ao carrinho!', 'erro');
        return;
    }
    
    const clienteSelect = document.getElementById('clienteVenda');
    const clienteId = clienteSelect.value ? parseInt(clienteSelect.value) : null;
    
    if (tipo === 'fiado' && !clienteId) {
        mostrarAlerta('Para vender fiado, selecione um cliente!', 'erro');
        return;
    }
    
    if (tipo === 'fiado' && clienteId) {
        const cliente = clientes.find(c => c.id === clienteId);
        const totalVenda = carrinho.reduce((s, i) => s + (i.preco * i.quantidade), 0);
        
        if (cliente.divida + totalVenda > cliente.limite_fiado) {
            mostrarAlerta(`Cliente excederia o limite de fiado! Limite: ${formatarMoeda(cliente.limite_fiado)}`, 'erro');
            return;
        }
    }
    
    const itens = carrinho.map(item => ({
        produto_id: item.produto_id,
        nome: item.nome,
        preco: item.preco,
        quantidade: item.quantidade
    }));
    
    const resultado = await apiPost('/vendas', {
        cliente_id: clienteId,
        itens: itens,
        tipo: tipo
    });
    
    mostrarAlerta(`Venda finalizada! Total: ${formatarMoeda(carrinho.reduce((s, i) => s + (i.preco * i.quantidade), 0))}`);
    carrinho = [];
    renderVendas();
}

// ========== PÁGINA DE PRODUTOS ==========

async function renderProdutos() {
    await carregarProdutos();
    
    const html = `
        <div class="card">
            <h2>📦 Produtos</h2>
            <button class="btn btn-primary" onclick="abrirModalProduto()" style="margin-bottom:15px">+ Novo Produto</button>
            
            <div class="table-container">
                 <table>
                    <thead>
                        <tr><th>ID</th><th>Produto</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr>
                    </thead>
                    <tbody>
                        ${produtos.map(p => `
                             <tr>
                                <td>${p.id}</td>
                                <td>${p.nome}</td>
                                <td>${formatarMoeda(p.preco)}</td>
                                <td style="${p.estoque < 10 ? 'color:#f44336; font-weight:bold' : ''}">${p.estoque}</td>
                                <td>
                                    <button class="btn btn-warning btn-small" onclick="editarProduto(${p.id})">✏️</button>
                                    <button class="btn btn-danger btn-small" onclick="excluirProduto(${p.id})">🗑️</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.getElementById('conteudo').innerHTML = html;
}

function abrirModalProduto(id = null) {
    const produto = id ? produtos.find(p => p.id === id) : null;
    const titulo = produto ? 'Editar Produto' : 'Novo Produto';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${titulo}</h3>
                <span class="close-modal">&times;</span>
            </div>
            <form id="formProduto">
                <div class="form-group">
                    <label>Nome</label>
                    <input type="text" id="modalNome" value="${produto ? produto.nome : ''}" required>
                </div>
                <div class="form-group">
                    <label>Preço (R$)</label>
                    <input type="number" step="0.01" id="modalPreco" value="${produto ? produto.preco : ''}" required>
                </div>
                <div class="form-group">
                    <label>Estoque</label>
                    <input type="number" id="modalEstoque" value="${produto ? produto.estoque : 0}" required>
                </div>
                <button type="submit" class="btn btn-primary">Salvar</button>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    
    modal.querySelector('#formProduto').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const dados = {
            nome: document.getElementById('modalNome').value,
            preco: parseFloat(document.getElementById('modalPreco').value),
            estoque: parseInt(document.getElementById('modalEstoque').value)
        };
        
        try {
            if (id) {
                await fetch(`${API_URL}/produtos/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
                mostrarAlerta('Produto atualizado!');
            } else {
                await fetch(`${API_URL}/produtos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
                mostrarAlerta('Produto criado!');
            }
            modal.remove();
            await renderProdutos();
            await carregarProdutos();
        } catch (error) {
            mostrarAlerta('Erro ao salvar produto!', 'erro');
        }
    });
}

async function editarProduto(id) {
    abrirModalProduto(id);
}

async function excluirProduto(id) {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
        try {
            const response = await fetch(`${API_URL}/produtos/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const erro = await response.json();
                mostrarAlerta(`Erro: ${erro.detail || 'Não foi possível excluir'}`, 'erro');
                return;
            }
            mostrarAlerta('Produto excluído!');
            await renderProdutos();
            await carregarProdutos();
        } catch (error) {
            console.error('Erro ao excluir produto:', error);
            mostrarAlerta('Erro ao excluir produto!', 'erro');
        }
    }
}

// ========== PÁGINA DE CLIENTES ==========

async function renderClientes() {
    try {
        await carregarClientes();
        
        // Garantir que todos os clientes têm os campos necessários
        const clientesSeguros = clientes.map(c => ({
            id: c.id || 0,
            nome: c.nome || 'N/A',
            telefone: c.telefone || '',
            limite_fiado: c.limite_fiado || 0,
            divida: c.divida || 0
        }));
        
        const html = `
            <div class="card">
                <h2>👥 Clientes</h2>
                <button class="btn btn-primary" onclick="abrirModalCliente()" style="margin-bottom:15px">+ Novo Cliente</button>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Limite</th><th>Dívida</th><th>Ações</th></tr>
                        </thead>
                        <tbody>
                            ${clientesSeguros.map(c => `
                                <tr>
                                    <td>${c.id}</td>
                                    <td>${c.nome}</td>
                                    <td>${c.telefone || '-'}</td>
                                    <td>${formatarMoeda(c.limite_fiado)}</td>
                                    <td style="${c.divida > 0 ? 'color:#f44336; font-weight:bold' : ''}">${formatarMoeda(c.divida)}</td>
                                    <td>
                                        <button class="btn btn-warning btn-small" onclick="editarCliente(${c.id})">✏️</button>
                                        <button class="btn btn-danger btn-small" onclick="excluirCliente(${c.id})">🗑️</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        document.getElementById('conteudo').innerHTML = html;
    } catch (error) {
        console.error('Erro ao renderizar clientes:', error);
        mostrarAlerta('Erro ao carregar clientes: ' + error.message, 'erro');
    }
}

function abrirModalCliente(id = null) {
    const cliente = id ? clientes.find(c => c.id === id) : null;
    const titulo = cliente ? 'Editar Cliente' : 'Novo Cliente';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${titulo}</h3>
                <span class="close-modal">&times;</span>
            </div>
            <form id="formCliente">
                <div class="form-group">
                    <label>Nome</label>
                    <input type="text" id="modalNome" value="${cliente ? cliente.nome : ''}" required>
                </div>
                <div class="form-group">
                    <label>Telefone</label>
                    <input type="text" id="modalTelefone" value="${cliente ? cliente.telefone : ''}">
                </div>
                <div class="form-group">
                    <label>Limite de Fiado (R$)</label>
                    <input type="number" step="0.01" id="modalLimite" value="${cliente ? cliente.limite_fiado : 0}">
                </div>
                <button type="submit" class="btn btn-primary">Salvar</button>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    
    modal.querySelector('#formCliente').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const dados = {
            nome: document.getElementById('modalNome').value,
            telefone: document.getElementById('modalTelefone').value || null,
            limite_fiado: parseFloat(document.getElementById('modalLimite').value || "0")
        };
        
        try {
            let response;
            if (id) {
                response = await fetch(`${API_URL}/clientes/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
            } else {
                response = await fetch(`${API_URL}/clientes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
            }
            
            if (!response.ok) {
                const erro = await response.json();
                mostrarAlerta(`Erro: ${JSON.stringify(erro.detail || erro)}`, 'erro');
                return;
            }
            
            mostrarAlerta(id ? 'Cliente atualizado!' : 'Cliente criado!');
            modal.remove();
            await renderClientes();
        } catch (error) {
            console.error('Erro ao salvar cliente:', error);
            mostrarAlerta('Erro ao salvar cliente!', 'erro');
        }
    });
}

async function editarCliente(id) {
    abrirModalCliente(id);
}

async function excluirCliente(id) {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
        try {
            const response = await fetch(`${API_URL}/clientes/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const erro = await response.json();
                mostrarAlerta(`Erro: ${erro.detail || 'Não foi possível excluir'}`, 'erro');
                return;
            }
            mostrarAlerta('Cliente excluído!');
            await renderClientes();
            await carregarClientes();
        } catch (error) {
            console.error('Erro ao excluir cliente:', error);
            mostrarAlerta('Erro ao excluir cliente!', 'erro');
        }
    }
}

// ========== PÁGINA DE FIADO ==========

async function renderFiado() {
    let devedores;
    try {
        const resp = await fetch(`${API_URL}/devedores`);
        devedores = await resp.json();
        localStorage.setItem('cache_devedores', JSON.stringify(devedores));
    } catch (error) {
        devedores = JSON.parse(localStorage.getItem('cache_devedores') || '[]');
    }
    
    // Garantir que todos os devedores têm os campos necessários
    const devedoresSeguros = devedores.map(c => ({
        id: c.id || 0,
        nome: c.nome || 'N/A',
        telefone: c.telefone || '',
        limite_fiado: c.limite_fiado || 0,
        divida: c.divida || 0
    }));
    
    const html = `
        <div class="card">
            <h2>📝 Controle de Fiado</h2>
            
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Telefone</th>
                            <th>Dívida</th>
                            <th>Limite</th>
                            <th>Disponível</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${devedoresSeguros.map(c => `
                            <tr>
                                <td>${c.nome}</td>
                                <td>${c.telefone || '-'}</td>
                                <td style="color:#f44336; font-weight:bold">${formatarMoeda(c.divida)}</td>
                                <td>${formatarMoeda(c.limite_fiado)}</td>
                                <td>${formatarMoeda(c.limite_fiado - c.divida)}</td>
                                <td>
                                    <button class="btn btn-primary btn-small" onclick="abrirPagamento(${c.id}, '${c.nome}', ${c.divida})">💰 Pagar</button>
                                </td>
                            </tr>
                        `).join('')}
                        ${devedoresSeguros.length === 0 ? '<tr><td colspan="6" style="text-align:center">Nenhum cliente com dívida</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.getElementById('conteudo').innerHTML = html;
}

function abrirPagamento(clienteId, nome, divida) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>💰 Pagamento - ${nome}</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="form-group">
                <label>Dívida atual: ${formatarMoeda(divida)}</label>
            </div>
            <div class="form-group">
                <label>Valor do pagamento (R$)</label>
                <input type="number" step="0.01" id="valorPagamento" max="${divida}">
            </div>
            <button class="btn btn-primary" onclick="registrarPagamento(${clienteId})">Registrar Pagamento</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
}

async function registrarPagamento(clienteId) {
    const valor = parseFloat(document.getElementById('valorPagamento').value);
    
    if (!valor || valor <= 0) {
        mostrarAlerta('Digite um valor válido!', 'erro');
        return;
    }
    
    try {
        const resp = await fetch(`${API_URL}/pagamentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cliente_id: clienteId, valor })
        });
        
        if (resp.ok) {
            mostrarAlerta(`Pagamento de ${formatarMoeda(valor)} registrado!`);
            fecharModalAtual();
            await renderFiado();
            await carregarClientes();
        } else {
            mostrarAlerta('Erro ao registrar pagamento!', 'erro');
        }
    } catch (error) {
        mostrarAlerta('Erro de conexão!', 'erro');
    }
}

function fecharModalAtual() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
}

// ========== NAVEGAÇÃO ==========

function mudarPagina(pagina) {
    paginaAtual = pagina;
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === pagina) {
            btn.classList.add('active');
        }
    });
    
    try {
        switch(pagina) {
            case 'dashboard': renderDashboard(); break;
            case 'vendas': renderVendas(); break;
            case 'produtos': renderProdutos(); break;
            case 'clientes': renderClientes(); break;
            case 'fiado': renderFiado(); break;
            default: console.warn('Página não reconhecida:', pagina);
        }
    } catch (error) {
        console.error('Erro ao renderizar página:', error);
        mostrarAlerta('Erro ao carregar página: ' + error.message, 'erro');
    }
}

// ========== SINCRONIZAÇÃO DE VENDAS PENDENTES ==========

async function sincronizarVendasPendentes() {
    const pendentes = JSON.parse(localStorage.getItem('vendas_pendentes') || '[]');
    if (pendentes.length > 0 && !modoOffline) {
        for (const venda of pendentes) {
            try {
                await fetch(`${API_URL}${venda.endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(venda.data)
                });
            } catch (error) {
                console.log('Erro ao sincronizar venda pendente');
            }
        }
        localStorage.setItem('vendas_pendentes', '[]');
        mostrarAlerta('Vendas pendentes sincronizadas!');
    }
}

// ========== PWA INSTALAÇÃO ==========

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installPWA').style.display = 'flex';
});

document.getElementById('btnInstall')?.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('installPWA').style.display = 'none';
        }
        deferredPrompt = null;
    }
});

// ========== INICIALIZAÇÃO ==========

// Carregar Chart.js de forma assíncrona
function carregarChartJS() {
    return new Promise((resolve) => {
        if (typeof Chart !== 'undefined') {
            resolve();
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = resolve;
            document.head.appendChild(script);
        }
    });
}

setInterval(atualizarDataHora, 1000);
atualizarDataHora();

// Adicionar event listeners aos botões de navegação
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        mudarPagina(btn.dataset.page);
    });
});

// Carregar dados iniciais em paralelo
(async () => {
    try {
        // Carregar Chart.js e dados em paralelo
        await Promise.all([
            carregarChartJS(),
            carregarDadosEmParalelo(),
            sincronizarVendasPendentes()
        ]);
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
    }
    
    // Ir para dashboard após carregar tudo
    mudarPagina('dashboard');
})();

// Sincronizar vendas pendentes a cada 60 segundos
setInterval(sincronizarVendasPendentes, 60000);

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .catch(err => console.log('Erro ao registrar Service Worker:', err));
}
