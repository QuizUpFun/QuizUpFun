import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: {
rejectUnauthorized: false
}
});

// =========================
// TESTE DO SERVIDOR
// =========================

app.get("/", (req, res) => {
res.json({
status: "online",
message: "QuizUp Admin Backend funcionando!"
});
});

// =========================
// TESTE DO BANCO
// =========================

app.get("/api/test-db", async (req, res) => {
try {
const result = await pool.query("SELECT NOW()");

res.json({
  status: "ok",
  database: "conectado",
  time: result.rows[0].now
});

} catch (error) {
console.error(error);

res.status(500).json({
  status: "error",
  message: "Erro ao conectar ao PostgreSQL"
});

}
});

// =========================
// CRIAR TABELA DE ADMINS
// =========================

async function criarTabelaAdmins() {
try {

await pool.query(`
  CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("Tabela admins pronta.");

} catch (error) {

console.error(
  "Erro ao criar tabela admins:",
  error
);

}
}

// =========================
// LOGIN DO ADMIN
// =========================

app.post("/api/admin/login", async (req, res) => {

try {

const { email, password } = req.body;

if (!email || !password) {

  return res.status(400).json({
    status: "error",
    message: "E-mail e senha são obrigatórios."
  });

}

const result = await pool.query(
  "SELECT id, email, senha FROM admins WHERE email = $1",
  [email.toLowerCase().trim()]
);

if (result.rows.length === 0) {

  return res.status(401).json({
    status: "error",
    message: "E-mail ou senha incorretos."
  });

}

const admin = result.rows[0];

const senhaCorreta = await bcrypt.compare(
  password,
  admin.senha
);

if (!senhaCorreta) {

  return res.status(401).json({
    status: "error",
    message: "E-mail ou senha incorretos."
  });

}

res.json({
  status: "ok",
  message: "Login realizado com sucesso.",
  admin: {
    id: admin.id,
    email: admin.email
  }
});

} catch (error) {

console.error(
  "Erro no login:",
  error
);

res.status(500).json({
  status: "error",
  message: "Erro interno no servidor."
});

}

});

// =========================
// INICIAR SERVIDOR
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {

console.log(
"QuizUp Admin Backend rodando na porta ${PORT}"
);

await criarTabelaAdmins();

});
