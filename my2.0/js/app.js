/* ==========================================================================
   MY ENERGY V2 - MASTERPIECE (Unified Controller)
   ========================================================================== */

/* ---------------- CONSTANTES & UTILS ---------------- */
const DB_KEY = "my_energy_v2_db";
const SALT = "my_energy_salt_2024";

// Gerador de ID único
const idGen = () => 'id_' + Math.random().toString(36).slice(2, 9);

// Data atual YYYY-MM-DD
const nowISO = () => new Date().toISOString().slice(0, 10);

// Hash de senha simples (apenas para evitar texto plano no localstorage)
const hash = (s) => btoa(s + SALT).slice(0, 16);

// Formatadores
const formatKwh = (val) => parseFloat(val).toFixed(2) + ' kWh';
const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
};

/* ---------------- BANCO DE DADOS (LOCALSTORAGE) ---------------- */
const initialData = {
    users: [
        // Admin Padrão: admin@app.com / admin123
        { id: "admin_01", name: "Super Admin", email: "admin@app.com", password: hash("admin123"), role: "admin" }
    ],
    clients: [], 
    houses: [],
    consumptions: []
};

function loadDB() {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
        localStorage.setItem(DB_KEY, JSON.stringify(initialData));
        return initialData;
    }
    return JSON.parse(raw);
}

function saveDB(data) {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
}

/* ---------------- AUTENTICAÇÃO ---------------- */
const Auth = {
    login: (email, password) => {
        const db = loadDB();
        const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        
        if (!user) return { success: false, msg: "Usuário não encontrado." };
        if (user.password !== hash(password)) return { success: false, msg: "Senha incorreta." };

        sessionStorage.setItem("user_session", JSON.stringify(user));
        return { success: true, user };
    },

    register: (name, email, password, role) => {
        const db = loadDB();
        if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
            return { success: false, msg: "E-mail já cadastrado." };
        }

        const newUser = { 
            id: idGen(), 
            name, 
            email, 
            password: hash(password), 
            role 
        };
        
        db.users.push(newUser);
        
        // Se for usuário comum, cria o cliente automaticamente
        if(role === 'user') {
            const newClient = { 
                id: idGen(), 
                userId: newUser.id, 
                name: name + " (Minha Conta)", 
                contact: email 
            };
            db.clients.push(newClient);
        }

        saveDB(db);
        return { success: true };
    },

    logout: () => {
        sessionStorage.removeItem("user_session");
        window.location.reload();
    },

    getCurrentUser: () => {
        const raw = sessionStorage.getItem("user_session");
        return raw ? JSON.parse(raw) : null;
    }
};

/* ---------------- INTERFACE (UI) ---------------- */
const UI = {
    showView: (viewId) => {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        // Menu Ativo
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
        if(navBtn) navBtn.classList.add('active');
    },

    toast: (msg, type = 'info') => {
        const el = document.getElementById('toast');
        el.innerText = msg;
        el.className = `toast ${type}`; // reset classes
        el.classList.remove('hidden');
        
        // Cores baseadas no tipo (via style inline para garantir)
        if(type === 'error') el.style.backgroundColor = '#ef4444';
        else if(type === 'success') el.style.backgroundColor = '#10b981';
        else el.style.backgroundColor = '#333';

        setTimeout(() => el.classList.add('hidden'), 3000);
    },

    initTheme: () => {
        if(localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            document.querySelector('#themeToggle i').className = 'fa-solid fa-sun';
        }
    },

    toggleTheme: () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        document.querySelector('#themeToggle i').className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
};

/* ---------------- APLICAÇÃO PRINCIPAL ---------------- */
let chartInstance = null;
let currentClient = null;
let currentHouse = null;

document.addEventListener('DOMContentLoaded', () => {
    UI.initTheme();
    const user = Auth.getCurrentUser();

    if (user) {
        initApp(user);
    } else {
        document.getElementById('mainHeader').classList.add('hidden'); // Esconde menu no login
        UI.showView('auth');
    }

    bindEvents();
});

function initApp(user) {
    document.getElementById('mainHeader').classList.remove('hidden');
    
    // Controle de Acesso (RBAC) e UX Dinâmica
    if (user.role !== 'admin') {
        // Esconde elementos exclusivos de admin
        document.querySelectorAll('.admin-only').forEach(e => e.style.display = 'none');
        
        // Esconde o filtro de "Cliente" no Dashboard
        document.getElementById('dashClientFilter').classList.add('hidden');
        
        // MUDANÇA VISUAL: Altera título da página de listagem
        document.getElementById('clientsPageTitle').innerText = "Minhas Residências";
        
        // Esconde a coluna de gerenciamento de clientes para user comum
        document.getElementById('cardClientsManager').classList.add('hidden');
        
        // Ajusta layout do grid para ocupar espaço total
        document.querySelector('#view-clients .grid-1-1').style.gridTemplateColumns = '1fr';

        // --- CORREÇÃO SOLICITADA: MUDA O BOTÃO DO MENU ---
        const navClientsBtn = document.getElementById('navClients');
        navClientsBtn.innerHTML = '<i class="fa-solid fa-house-user"></i> <span class="desktop-only">Residências</span>';

    } else {
        // Se for admin, garante que tudo está visível e com nomes padrão
        document.querySelectorAll('.admin-only').forEach(e => e.style.display = 'inline-flex');
        document.querySelector('#view-clients .grid-1-1').style.gridTemplateColumns = '1fr 1fr';
        
        const navClientsBtn = document.getElementById('navClients');
        navClientsBtn.innerHTML = '<i class="fa-solid fa-users"></i> <span class="desktop-only">Clientes</span>';
    }

    // Inicialização
    UI.showView('dashboard');
    renderClientsList(); // Necessário para admin
    
    // Se for User Comum, auto-seleciona o cliente dele
    if(user.role !== 'admin') {
        const db = loadDB();
        const myClient = db.clients.find(c => c.userId === user.id);
        if(myClient) {
            currentClient = myClient.id;
            loadHousesForSelect(myClient.id); // Popula select do dashboard
            renderHousesList(myClient.id);    // Popula tela de settings
        } else {
            console.warn("Usuário sem cliente vinculado.");
        }
    } 
    
    loadDashboardData();
}

/* --- DASHBOARD --- */
function loadDashboardData() {
    const user = Auth.getCurrentUser();
    const db = loadDB();
    
    // Filtro de Clientes Permitidos
    let targetClients = [];
    if (user.role === 'admin') {
        targetClients = db.clients;
    } else {
        targetClients = db.clients.filter(c => c.userId === user.id);
    }
    
    // Popula Select de Clientes (Apenas Admin)
    const selClient = document.getElementById('selDashClient');
    if(user.role === 'admin') {
        selClient.innerHTML = '<option value="all">Todos os Clientes</option>';
        targetClients.forEach(c => {
            const selected = c.id === currentClient ? 'selected' : '';
            selClient.innerHTML += `<option value="${c.id}" ${selected}>${c.name}</option>`;
        });
    }

    updateKPIs(db.consumptions, db.houses, targetClients);
}

function updateKPIs(consumptions, houses, allowedClients) {
    // 1. Filtrar casas permitidas (baseadas nos clientes)
    const allowedClientIds = allowedClients.map(c => c.id);
    
    // Se Admin selecionou um cliente específico no dropdown
    let targetHouseIds = [];
    
    if (currentClient && currentClient !== 'all') {
        // Casas apenas deste cliente
        targetHouseIds = houses.filter(h => h.clientId === currentClient).map(h => h.id);
    } else {
        // Casas de todos os clientes permitidos
        targetHouseIds = houses.filter(h => allowedClientIds.includes(h.clientId)).map(h => h.id);
    }

    // 2. Filtrar consumos
    let filteredCons = consumptions.filter(c => targetHouseIds.includes(c.houseId));

    // 3. Filtro Específico de Casa (Dropdown Residência)
    if(currentHouse) {
        filteredCons = filteredCons.filter(c => c.houseId === currentHouse);
    }

    // Cálculos
    const total = filteredCons.reduce((acc, cur) => acc + parseFloat(cur.kwh), 0);
    const avg = filteredCons.length ? (total / filteredCons.length) : 0;

    // Atualiza Tela
    document.getElementById('kpiTotal').innerText = formatKwh(total);
    document.getElementById('kpiAvg').innerText = formatKwh(avg);
    document.getElementById('kpiHouses').innerText = currentHouse ? 1 : targetHouseIds.length;

    renderChart(filteredCons);
    renderTable(filteredCons);
}

function loadHousesForSelect(clientId) {
    const db = loadDB();
    const sel = document.getElementById('selDashHouse');
    sel.innerHTML = '<option value="">Todas as Residências</option>';
    
    let houses = [];
    if (clientId === 'all' || !clientId) {
        // Se for admin vendo tudo, ou user carregando inicial
        const user = Auth.getCurrentUser();
        if(user.role === 'admin') houses = db.houses;
        else {
            // User comum: acha o cliente dele primeiro
            const myClient = db.clients.find(c => c.userId === user.id);
            if(myClient) houses = db.houses.filter(h => h.clientId === myClient.id);
        }
    } else {
        houses = db.houses.filter(h => h.clientId === clientId);
    }

    houses.forEach(h => {
        sel.innerHTML += `<option value="${h.id}">${h.label} - ${h.address}</option>`;
    });
}

function renderTable(data) {
    const tbody = document.querySelector('#tableConsumption tbody');
    tbody.innerHTML = '';
    const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));

    if(sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center muted p-4">Nenhum dado encontrado.</td></tr>';
        return;
    }

    const user = Auth.getCurrentUser();
    sorted.slice(0, 10).forEach(item => {
        // Botão apagar apenas para Admin
        const btnDelete = user.role === 'admin' 
            ? `<button class="icon-btn" style="color:var(--danger)" onclick="deleteConsumption('${item.id}')"><i class="fa-solid fa-trash"></i></button>` 
            : '';
            
        tbody.innerHTML += `
            <tr>
                <td>${formatDate(item.date)}</td>
                <td><strong>${item.kwh} kWh</strong></td>
                <td class="muted">${item.note || '-'}</td>
                <td class="text-right">${btnDelete}</td>
            </tr>
        `;
    });
}

function renderChart(data) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    const grouped = {};
    
    // Agrupa por data e soma
    data.forEach(d => {
        grouped[d.date] = (grouped[d.date] || 0) + parseFloat(d.kwh);
    });
    
    const labels = Object.keys(grouped).sort();
    const values = labels.map(date => grouped[date]);
    const formattedLabels = labels.map(d => formatDate(d));

    if (chartInstance) chartInstance.destroy();

    const color = getComputedStyle(document.body).getPropertyValue('--primary').trim();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Consumo (kWh)',
                data: values,
                borderColor: color,
                backgroundColor: color + '20', // Opacidade
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

/* --- CLIENTS & HOUSES --- */
function renderClientsList() {
    const db = loadDB();
    const list = document.getElementById('listClients');
    list.innerHTML = '';

    if(db.clients.length === 0) {
        list.innerHTML = '<div class="muted p-4">Nenhum cliente.</div>';
        return;
    }

    db.clients.forEach(c => {
        list.innerHTML += `
            <div class="list-item" onclick="selectClientManager('${c.id}')">
                <div>
                    <strong>${c.name}</strong><br>
                    <small class="muted">${c.contact}</small>
                </div>
                <i class="fa-solid fa-chevron-right muted"></i>
            </div>
        `;
    });
}

function renderHousesList(clientId) {
    const db = loadDB();
    const list = document.getElementById('listHouses');
    const title = document.getElementById('houseListTitle');
    
    const client = db.clients.find(c => c.id === clientId);
    if(client) title.innerText = `Casas de ${client.name}`;
    
    const houses = db.houses.filter(h => h.clientId === clientId);
    list.innerHTML = '';

    if(houses.length === 0) {
        list.innerHTML = '<div class="empty-state p-4 muted">Nenhuma residência encontrada.</div>';
        return;
    }

    houses.forEach(h => {
        // Admin pode apagar, User não
        const user = Auth.getCurrentUser();
        const btnDel = user.role === 'admin' 
            ? `<button class="icon-btn" style="color:var(--danger)" onclick="deleteHouse('${h.id}')"><i class="fa-solid fa-trash"></i></button>` 
            : '';

        list.innerHTML += `
            <div class="list-item">
                <div onclick="selectHouseForDash('${h.id}')" style="flex:1">
                    <i class="fa-solid fa-house muted" style="margin-right:10px"></i> 
                    <strong>${h.label}</strong><br>
                    <small class="muted">${h.address}</small>
                </div>
                ${btnDel}
            </div>
        `;
    });
}

/* --- USERS MANAGER (ADMIN) --- */
function renderUsersTable() {
    const db = loadDB();
    const tbody = document.querySelector('#tableUsers tbody');
    const currentUser = Auth.getCurrentUser();
    tbody.innerHTML = '';

    db.users.forEach(u => {
        const isMe = u.id === currentUser.id;
        const btnDel = !isMe 
            ? `<button class="icon-btn" style="color:var(--danger)" onclick="deleteUser('${u.id}')"><i class="fa-solid fa-trash"></i></button>`
            : '<span class="muted">(Você)</span>';

        tbody.innerHTML += `
            <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td><span class="badge">${u.role}</span></td>
                <td class="text-right">${btnDel}</td>
            </tr>
        `;
    });
}

/* --- EXPOSED GLOBAL ACTIONS (Para onclick no HTML) --- */
window.selectClientManager = (id) => {
    currentClient = id;
    renderHousesList(id);
};

window.selectHouseForDash = (houseId) => {
    // Ao clicar na casa na lista, vai pro dashboard filtrado nela
    currentHouse = houseId;
    
    // Se o cliente atual não estiver setado (ex: user admin navegando direto), seta
    const db = loadDB();
    const house = db.houses.find(h => h.id === houseId);
    if(house) {
        currentClient = house.clientId;
        // Atualiza os selects do dashboard
        loadHousesForSelect(currentClient); 
        document.getElementById('selDashHouse').value = houseId;
        if(document.getElementById('selDashClient')) {
            document.getElementById('selDashClient').value = currentClient;
        }
    }
    
    UI.showView('dashboard');
    loadDashboardData();
};

window.deleteConsumption = (id) => {
    if(!confirm('Tem certeza que deseja apagar este registro?')) return;
    const db = loadDB();
    db.consumptions = db.consumptions.filter(c => c.id !== id);
    saveDB(db);
    loadDashboardData();
    UI.toast('Registro apagado.', 'success');
};

window.deleteHouse = (id) => {
    if(!confirm('ATENÇÃO: Apagar a residência apagará todos os consumos dela. Continuar?')) return;
    const db = loadDB();
    db.houses = db.houses.filter(h => h.id !== id);
    db.consumptions = db.consumptions.filter(c => c.houseId !== id);
    saveDB(db);
    renderHousesList(currentClient);
    loadDashboardData();
    UI.toast('Residência apagada.', 'success');
};

window.deleteUser = (id) => {
    if(!confirm('Apagar usuário?')) return;
    const db = loadDB();
    db.users = db.users.filter(u => u.id !== id);
    // Nota: Poderia apagar clientes/casas do usuário aqui, mas mantemos os dados por segurança no protótipo
    saveDB(db);
    renderUsersTable();
    UI.toast('Usuário removido.', 'success');
};

/* ---------------- EVENT LISTENERS ---------------- */
function bindEvents() {
    
    // LOGIN
    document.getElementById('formLogin').addEventListener('submit', (e) => {
        e.preventDefault();
        const res = Auth.login(
            document.getElementById('loginEmail').value.trim(), 
            document.getElementById('loginPassword').value
        );
        if(res.success) {
            window.location.reload();
        } else {
            UI.toast(res.msg, 'error');
        }
    });

    // REGISTER SWITCHER
    document.getElementById('toRegister').onclick = (e) => {
        e.preventDefault();
        document.getElementById('formLogin').classList.add('hidden');
        document.getElementById('formRegister').classList.remove('hidden');
        document.getElementById('txtLogin').classList.add('hidden');
        document.getElementById('txtRegister').classList.remove('hidden');
    };
    
    document.getElementById('toLogin').onclick = (e) => {
        e.preventDefault();
        document.getElementById('formLogin').classList.remove('hidden');
        document.getElementById('formRegister').classList.add('hidden');
        document.getElementById('txtLogin').classList.remove('hidden');
        document.getElementById('txtRegister').classList.add('hidden');
    };

    // REGISTER SUBMIT
    document.getElementById('formRegister').addEventListener('submit', (e) => {
        e.preventDefault();
        const res = Auth.register(
            document.getElementById('regName').value.trim(),
            document.getElementById('regEmail').value.trim(),
            document.getElementById('regPassword').value,
            document.getElementById('regRole').value
        );
        if(res.success) {
            UI.toast('Conta criada com sucesso! Faça login.', 'success');
            document.getElementById('toLogin').click();
        } else {
            UI.toast(res.msg, 'error');
        }
    });

    // GLOBAL ACTIONS
    document.getElementById('logoutBtn').onclick = Auth.logout;
    document.getElementById('themeToggle').onclick = UI.toggleTheme;

    // MENU NAVIGATION
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            UI.showView(view);
            if(view === 'dashboard') loadDashboardData();
            if(view === 'users') renderUsersTable();
        });
    });

    // DASHBOARD FILTERS
    const dashClient = document.getElementById('selDashClient');
    if(dashClient) {
        dashClient.addEventListener('change', (e) => {
            currentClient = e.target.value;
            loadHousesForSelect(currentClient);
            currentHouse = null;
            loadDashboardData();
        });
    }

    document.getElementById('selDashHouse').addEventListener('change', (e) => {
        currentHouse = e.target.value;
        loadDashboardData();
    });

    // ADD CONSUMPTION
    document.getElementById('formConsumption').addEventListener('submit', (e) => {
        e.preventDefault();
        if(!currentHouse) return UI.toast('Selecione uma residência primeiro!', 'error');
        
        const db = loadDB();
        db.consumptions.push({
            id: idGen(),
            houseId: currentHouse,
            date: document.getElementById('conDate').value,
            kwh: document.getElementById('conKwh').value,
            note: document.getElementById('conNote').value
        });
        saveDB(db);
        
        UI.toast('Consumo salvo!', 'success');
        document.getElementById('formConsumption').reset();
        document.getElementById('conDate').value = nowISO(); // reseta data pra hoje
        loadDashboardData();
    });

    // ADD CLIENT (Admin)
    document.getElementById('btnNewClient')?.addEventListener('click', () => {
        const name = prompt("Nome do Cliente:");
        const contact = prompt("Contato (Email/Tel):");
        if(name) {
            const db = loadDB();
            const user = Auth.getCurrentUser();
            db.clients.push({ id: idGen(), userId: user.id, name, contact });
            saveDB(db);
            renderClientsList();
            UI.toast('Cliente adicionado', 'success');
        }
    });

    // ADD HOUSE
    document.getElementById('btnNewHouse').addEventListener('click', () => {
        if(!currentClient || currentClient === 'all') return UI.toast('Selecione um cliente específico primeiro.', 'error');
        
        const label = prompt("Apelido da Residência (ex: Casa Praia):");
        const address = prompt("Endereço:");
        if(label) {
            const db = loadDB();
            db.houses.push({ id: idGen(), clientId: currentClient, label, address });
            saveDB(db);
            renderHousesList(currentClient);
            loadHousesForSelect(currentClient); // Atualiza dropdown do dash
            UI.toast('Residência adicionada', 'success');
        }
    });

    // BACKUP
    document.getElementById('btnExport').onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(loadDB()));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = "backup_my_energy.json";
        a.click();
    };

    document.getElementById('fileImport').onchange = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target.result);
                if(json.users && json.consumptions) {
                    saveDB(json);
                    alert("Importação realizada com sucesso! A página será recarregada.");
                    window.location.reload();
                } else {
                    alert("Arquivo inválido.");
                }
            } catch(err) {
                alert("Erro ao ler arquivo.");
            }
        };
        reader.readAsText(file);
    };
    
    // PROFILE EDIT
    document.getElementById('formProfile').addEventListener('submit', (e) => {
        e.preventDefault();
        const db = loadDB();
        const currentUser = Auth.getCurrentUser();
        const userIndex = db.users.findIndex(u => u.id === currentUser.id);
        
        if(userIndex > -1) {
            const name = document.getElementById('profName').value;
            const pass = document.getElementById('profPass').value;
            
            db.users[userIndex].name = name;
            if(pass) db.users[userIndex].password = hash(pass);
            
            saveDB(db);
            // Atualiza sessão
            sessionStorage.setItem("user_session", JSON.stringify(db.users[userIndex]));
            UI.toast('Perfil atualizado!', 'success');
        }
    });
    
    // Preencher Profile ao carregar
    const u = Auth.getCurrentUser();
    if(u) {
        document.getElementById('profName').value = u.name;
        document.getElementById('profEmail').value = u.email;
    }
}