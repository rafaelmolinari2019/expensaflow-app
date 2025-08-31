// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Importar os modelos
const User = require('./models/user.model');
const Expense = require('./models/expense.model');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

// --- Conexão com o Banco de Dados MongoDB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Conectado ao MongoDB com sucesso!'))
  .catch(err => console.error('Falha ao conectar ao MongoDB:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Configuração do Multer (sem alterações) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens (jpeg, jpg, png) e PDFs são permitidos'));
    }
  }
});

// REMOVEMOS OS ARRAYS DE SIMULAÇÃO DE BANCO DE DADOS

// --- Middleware de autenticação (sem alterações) ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token de acesso necessário' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

// --- ROTAS REFATORADAS PARA USAR MONGODB ---

// Rotas de autenticação
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, company } = req.body;

    // ADICIONE ESTA LINHA PARA VER O QUE ESTÁ CHEGANDO
    console.log(`Tentativa de registro com o e-mail: [${email}]`);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: email === 'admin@expensaflow.com' ? 'admin' : 'user', // Exemplo de regra para admin
      company
    });

    const token = jwt.sign({ userId: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({
      message: 'Usuário criado com sucesso',
      token,
      user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role }
    });
  } catch (error) {
    console.error("ERRO DETALHADO NO REGISTRO:", error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Credenciais inválidas' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      message: 'Login bem-sucedido',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rotas de despesas
app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { userId: req.user.userId };
    const userExpenses = await Expense.find(query).populate('userId', 'name email');
    res.json(userExpenses);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar despesas' });
  }
});

app.get('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Despesa não encontrada' });
    if (req.user.role !== 'admin' && expense.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso não autorizado' });
    }
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar despesa' });
  }
});

app.post('/api/expenses', authenticateToken, upload.single('receipt'), async (req, res) => {
  try {
    const { description, category, amount, date } = req.body;
    if (!description || !category || !amount || !date) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const newExpense = await Expense.create({
      userId: req.user.userId,
      description,
      category,
      amount: parseFloat(amount),
      date,
      receipt: req.file ? req.file.filename : null,
      status: 'pending'
    });
    res.status(201).json(newExpense);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar despesa' });
  }
});

app.put('/api/expenses/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso não autorizado' });
  }

  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const updatedExpense = await Expense.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!updatedExpense) return res.status(404).json({ error: 'Despesa não encontrada' });
    res.json(updatedExpense);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar despesa' });
  }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Despesa não encontrada' });

    if (req.user.role !== 'admin' && expense.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso não autorizado' });
    }

    // Remover arquivo de comprovante se existir
    if (expense.receipt) {
      const filePath = path.join(__dirname, 'uploads', expense.receipt);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Despesa excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir despesa' });
  }
});

// Rota para estatísticas
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const matchQuery = req.user.role === 'admin' ? {} : { userId: new mongoose.Types.ObjectId(req.user.userId) };

        const stats = await Expense.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        const result = {
            Pendente: stats.find(s => s._id === 'pending')?.count || 0,
            Aprovado: stats.find(s => s._id === 'approved')?.count || 0,
            Rejeitado: stats.find(s => s._id === 'rejected')?.count || 0,
            totalAmount: stats.find(s => s._id === 'approved')?.totalAmount.toFixed(2) || '0.00'
        };

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao calcular estatísticas' });
    }
});

// ... (todo o resto do seu server.js fica igual)

// Rota para obter usuários (apenas admin)
app.get('/api/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso não autorizado' });
  }
  try {
    // ALTERAÇÃO: Filtramos para retornar apenas usuários com a role 'user'
    const users = await User.find({ role: 'user' }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// ... (o resto do seu server.js)

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});