document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO E ESTADO GLOBAL ---
    const API_BASE_URL = 'http://localhost:3001';
    const API_URL = `${API_BASE_URL}/api`;
    let userToken = localStorage.getItem('token');
    let currentUser = JSON.parse(localStorage.getItem('user'));
    let dataPollingInterval = null;

    // --- SELETORES DE ELEMENTOS DO DOM ---
    const authNav = document.getElementById('auth-nav');
    const userNav = document.getElementById('user-nav');
    const marketingSection = document.getElementById('marketing-section');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginButton = document.getElementById('loginButton');
    const expenseForm = document.getElementById('expenseForm');

    const loginModalEl = document.getElementById('loginModal');
    const loginModal = new bootstrap.Modal(loginModalEl);
    const registerModal = new bootstrap.Modal(document.getElementById('registerModal'));

    const adminDashboard = document.getElementById('admin-dashboard');
    const userDashboard = document.getElementById('user-dashboard'); 
    const adminExpensesTbody = document.getElementById('admin-expenses-tbody');
    const userExpensesTbody = document.getElementById('user-expenses-tbody');
    
    // --- FUNÇÕES DE LÓGICA ---

    const updateUI = () => {
        if (userToken && currentUser) {
            authNav.classList.add('d-none');
            userNav.classList.remove('d-none');
            marketingSection.classList.add('d-none');
            welcomeMessage.textContent = `Olá, ${currentUser.name}!`;
            if (currentUser.role === 'admin') {
                userDashboard.classList.add('d-none');
                adminDashboard.classList.remove('d-none');
                fetchAdminData();
                if (dataPollingInterval) clearInterval(dataPollingInterval);
                dataPollingInterval = setInterval(fetchAdminData, 15000);
            } else {
                adminDashboard.classList.add('d-none');
                userDashboard.classList.remove('d-none');
                fetchUserData();
            }
        } else {
            authNav.classList.remove('d-none');
            userNav.classList.add('d-none');
            marketingSection.classList.remove('d-none');
            adminDashboard.classList.add('d-none');
            userDashboard.classList.add('d-none');
            if (dataPollingInterval) clearInterval(dataPollingInterval);
        }
    };

    const saveCredentials = (user, token) => {
        currentUser = user;
        userToken = token;
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);
    };

    const clearCredentials = () => {
        currentUser = null;
        userToken = null;
        localStorage.clear();
    };

    const fetchUserData = async () => {
        if (!userToken) return;
        try {
            const [statsRes, expensesRes] = await Promise.all([
                fetch(`${API_URL}/stats`, { headers: { 'Authorization': `Bearer ${userToken}` } }),
                fetch(`${API_URL}/expenses`, { headers: { 'Authorization': `Bearer ${userToken}` } })
            ]);
            if (!statsRes.ok || !expensesRes.ok) throw new Error('Falha ao buscar dados do usuário.');
            const stats = await statsRes.json();
            const expenses = await expensesRes.json();
            document.getElementById('user-pending-count').textContent = stats.Pendente;
            document.getElementById('user-approved-count').textContent = stats.Aprovado;
            document.getElementById('user-total-amount').textContent = `R$ ${parseFloat(stats.totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            renderUserExpensesTable(expenses);
        } catch (error) { console.error('Erro em fetchUserData:', error); }
    };

    const renderUserExpensesTable = (expenses) => {
        userExpensesTbody.innerHTML = '';
        if (expenses.length === 0) {
            userExpensesTbody.innerHTML = '<tr><td colspan="5" class="text-center">Você ainda não registrou nenhuma despesa.</td></tr>';
            return;
        }
        expenses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        expenses.forEach(expense => {
            const date = new Date(expense.date);
            const formattedDate = date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const deleteButton = expense.status === 'pendente' ? `<button class="btn btn-outline-danger btn-sm delete-btn" data-id="${expense.id}" title="Excluir"><i class="fas fa-trash"></i></button>` : '';
            const row = `<tr id="user-expense-row-${expense.id}"><td>${expense.description}</td><td>${formattedDate}</td><td>R$ ${expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td><span class="expense-status status-${expense.status}">${expense.status}</span></td><td class="text-center">${deleteButton}</td></tr>`;
            userExpensesTbody.insertAdjacentHTML('beforeend', row);
        });
    };

    const deleteExpense = async (expenseId) => {
        if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;
        try {
            const response = await fetch(`${API_URL}/expenses/${expenseId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${userToken}` } });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Falha ao excluir despesa.');
            }
            fetchUserData();
        } catch (error) { console.error('Erro ao excluir despesa:', error); alert(`Erro: ${error.message}`); }
    };
    
    const fetchAdminData = async () => {
        if (!userToken) return;
        try {
            const response = await fetch(`${API_URL}/expenses`, { headers: { 'Authorization': `Bearer ${userToken}` } });
            if (!response.ok) throw new Error('Falha ao buscar despesas.');
            const allExpenses = await response.json();
            const pendingExpenses = allExpenses.filter(e => e.status === 'pendente');
            renderAdminExpensesTable(pendingExpenses);
        } catch (error) { console.error('Erro em fetchAdminData:', error); }
    };

    const renderAdminExpensesTable = (expenses) => {
        adminExpensesTbody.innerHTML = '';
        if (expenses.length === 0) {
            adminExpensesTbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">Nenhuma despesa pendente de aprovação.</td></tr>';
            return;
        }
        expenses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        expenses.forEach(expense => {
            const date = new Date(expense.date);
            const formattedDate = date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const receiptLink = expense.receipt ? `<a href="${API_BASE_URL}/uploads/${expense.receipt}" target="_blank" class="btn btn-sm btn-outline-secondary">Ver</a>` : 'N/A';
            const row = `<tr id="expense-row-${expense.id}"><td>${expense.userId.name || 'Usuário Indisponível'}</td><td>${expense.description}</td><td>${formattedDate}</td><td>R$ ${expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="text-center">${receiptLink}</td><td class="text-center"><button class="btn btn-success btn-sm approve-btn" data-id="${expense.id}" title="Aprovar"><i class="fas fa-check"></i></button><button class="btn btn-danger btn-sm reject-btn ms-1" data-id="${expense.id}" title="Reprovar"><i class="fas fa-times"></i></button></td></tr>`;
            adminExpensesTbody.insertAdjacentHTML('beforeend', row);
        });
    };

    const updateExpenseStatus = async (expenseId, newStatus) => {
        try {
            const response = await fetch(`${API_URL}/expenses/${expenseId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` }, body: JSON.stringify({ status: newStatus }) });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Falha ao atualizar status.');
            }
            const row = document.getElementById(`expense-row-${expenseId}`);
            if (row) {
                row.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                row.style.opacity = '0';
                row.style.transform = 'translateX(20px)';
                setTimeout(() => row.remove(), 500);
            }
        } catch (error) { console.error('Erro em updateExpenseStatus:', error); alert(`Erro: ${error.message}`); }
    };
    
    // --- EVENT LISTENERS ---

    if (loginButton) {
        loginButton.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!loginForm.checkValidity()) {
                loginForm.reportValidity();
                return;
            }
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            try {
                const response = await fetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                saveCredentials(data.user, data.token);
                loginModal.hide();
            } catch (error) { alert(`Erro de login: ${error.message}`); }
        });
    }

    if(loginModalEl) {
        loginModalEl.addEventListener('hidden.bs.modal', () => {
            if (currentUser) {
                updateUI();
                loginForm.reset();
            }
        });
    }

    if(registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('registerName').value;
            const company = document.getElementById('registerCompany').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            try {
                const response = await fetch(`${API_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, company, email, password }) });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                alert("Registro bem-sucedido! Faça o login para continuar.");
                registerModal.hide();
                registerForm.reset();
            } catch (error) { alert(`Erro de registro: ${error.message}`); }
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            clearCredentials();
            updateUI();
        });
    }

    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(expenseForm);
            try {
                const response = await fetch(`${API_URL}/expenses`, { method: 'POST', headers: { 'Authorization': `Bearer ${userToken}` }, body: formData });
                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Erro ao adicionar despesa');
                }
                alert('Despesa adicionada com sucesso!');
                expenseForm.reset();
                fetchUserData();
            } catch (error) { alert(`Erro: ${error.message}`); }
        });
    }

    if (userExpensesTbody) {
        userExpensesTbody.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-btn');
            if (deleteBtn) {
                const expenseId = deleteBtn.dataset.id;
                deleteExpense(expenseId);
            }
        });
    }

    if (adminExpensesTbody) {
        adminExpensesTbody.addEventListener('click', (e) => {
            const approveBtn = e.target.closest('.approve-btn');
            const rejectBtn = e.target.closest('.reject-btn');
            if (approveBtn) {
                const expenseId = approveBtn.dataset.id;
                updateExpenseStatus(expenseId, 'aprovado');
            }
            if (rejectBtn) {
                const expenseId = rejectBtn.dataset.id;
                updateExpenseStatus(expenseId, 'rejeitado');
            }
        });
    }

    // --- INICIALIZAÇÃO DA PÁGINA ---
    updateUI();
});