const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não configurada.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   BANCO
========================= */

async function prepararBanco() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      senha VARCHAR(255) NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Tabela admins pronta.");

  /*
    A tabela jogadores já existe no seu banco.
    Não vamos apagá-la nem recriá-la.
  */

  try {
    await pool.query(`
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS pontos BIGINT DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS equilibrio NUMERIC DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    console.log("Estrutura de jogadores verificada.");
  } catch (erro) {
    console.error("Erro ao verificar jogadores:", erro.message);
  }
}

/* =========================
   FUNÇÕES AUXILIARES
========================= */

function limparCPF(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function gerarCodigo() {
  return "QU" +
    Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
}

/* =========================
   TESTE
========================= */

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "QuizUp Admin Backend funcionando."
  });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS agora");

    res.json({
      ok: true,
      banco: "PostgreSQL conectado",
      agora: result.rows[0].agora
    });
  } catch (erro) {
    console.error(erro);

    res.status(500).json({
      ok: false,
      error: "Erro ao conectar ao PostgreSQL."
    });
  }
});

/* =========================
   CADASTRO
========================= */

app.post("/api/cadastro", async (req, res) => {
  try {
    let {
      email,
      senha,
      nome,
      cpf,
      codigo_indicacao,
      referrer
    } = req.body;

    email = String(email || "").trim().toLowerCase();
    senha = String(senha || "");
    nome = String(nome || "").trim();
    cpf = limparCPF(cpf);

    if (!email || !senha || !nome || !cpf) {
      return res.status(400).json({
        error: "Preencha todos os campos."
      });
    }

    if (senha.length < 8) {
      return res.status(400).json({
        error: "A senha precisa ter pelo menos 8 caracteres."
      });
    }

    if (cpf.length !== 11) {
      return res.status(400).json({
        error: "Digite um CPF válido com 11 números."
      });
    }

    const emailExistente = await pool.query(
      `SELECT id FROM jogadores WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );

    if (emailExistente.rows.length > 0) {
      return res.status(409).json({
        error: "Este e-mail já está cadastrado."
      });
    }

    const cpfExistente = await pool.query(
      `SELECT id FROM jogadores WHERE cpf = $1 LIMIT 1`,
      [cpf]
    );

    if (cpfExistente.rows.length > 0) {
      return res.status(409).json({
        error: "Este CPF já está cadastrado."
      });
    }

    if (!codigo_indicacao) {
      codigo_indicacao = gerarCodigo();
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const result = await pool.query(
      `
      INSERT INTO jogadores
      (
        email,
        senha,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      )
      VALUES
      ($1, $2, $3, $4, $5, 0, 0, CURRENT_TIMESTAMP)
      RETURNING
        id,
        email,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      `,
      [
        email,
        senhaHash,
        nome,
        cpf,
        codigo_indicacao
      ]
    );

    const jogador = result.rows[0];

    /*
      O referrer é recebido para manter o link
      ?ref=CODIGO, mas ainda não é gravado
      porque a tabela atual não possui essa coluna.
    */

    res.status(201).json({
      ok: true,
      message: "Cadastro realizado com sucesso.",
      id: jogador.id,
      email: jogador.email,
      nome: jogador.nome,
      cpf: jogador.cpf,
      codigo_indicacao: jogador.codigo_indicacao,
      pontos: Number(jogador.pontos || 0),
      equilibrio: Number(jogador.equilibrio || 0)
    });

  } catch (erro) {
    console.error("ERRO NO CADASTRO:", erro);

    res.status(500).json({
      error: "Erro interno ao realizar cadastro."
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const senha = String(req.body.senha || "");

    if (!email || !senha) {
      return res.status(400).json({
        error: "Informe e-mail e senha."
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        email,
        senha,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      FROM jogadores
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "E-mail ou senha incorretos."
      });
    }

    const jogador = result.rows[0];

    const senhaCorreta = await bcrypt.compare(
      senha,
      jogador.senha
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        error: "E-mail ou senha incorretos."
      });
    }

    delete jogador.senha;

    res.json({
      ok: true,
      jogador: {
        ...jogador,
        pontos: Number(jogador.pontos || 0),
        equilibrio: Number(jogador.equilibrio || 0)
      }
    });

  } catch (erro) {
    console.error("ERRO NO LOGIN:", erro);

    res.status(500).json({
      error: "Erro interno ao realizar login."
    });
  }
});

/* =========================
   BUSCAR JOGADOR
========================= */

app.get("/api/jogador/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "ID inválido."
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        email,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      FROM jogadores
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Jogador não encontrado."
      });
    }

    const jogador = result.rows[0];

    res.json({
      ok: true,
      jogador: {
        ...jogador,
        pontos: Number(jogador.pontos || 0),
        equilibrio: Number(jogador.equilibrio || 0)
      }
    });

  } catch (erro) {
    console.error("ERRO AO BUSCAR JOGADOR:", erro);

    res.status(500).json({
      error: "Erro ao buscar jogador."
    });
  }
});

/* =========================
   ATUALIZAR JOGADOR
========================= */

app.put("/api/jogador/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "ID inválido."
      });
    }

    const pontos = Number(req.body.pontos);

    const equilibrio = Number(req.body.equilibrio);

    if (!Number.isFinite(pontos) || pontos < 0) {
      return res.status(400).json({
        error: "Pontos inválidos."
      });
    }

    if (!Number.isFinite(equilibrio) || equilibrio < 0) {
      return res.status(400).json({
        error: "Saldo inválido."
      });
    }

    const result = await pool.query(
      `
      UPDATE jogadores
      SET
        pontos = $1,
        equilibrio = $2
      WHERE id = $3
      RETURNING
        id,
        email,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      `,
      [
        Math.floor(pontos),
        equilibrio,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Jogador não encontrado."
      });
    }

    res.json({
      ok: true,
      jogador: result.rows[0]
    });

  } catch (erro) {
    console.error("ERRO AO ATUALIZAR JOGADOR:", erro);

    res.status(500).json({
      error: "Erro ao atualizar jogador."
    });
  }
});

/* =========================
   RECUPERAÇÃO DE SENHA
========================= */

app.post("/api/recuperar-senha", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const cpf = limparCPF(req.body.cpf);

    const novaSenha = String(req.body.novaSenha || "");

    if (!email || !cpf || !novaSenha) {
      return res.status(400).json({
        error: "Preencha e-mail, CPF e nova senha."
      });
    }

    if (cpf.length !== 11) {
      return res.status(400).json({
        error: "CPF inválido."
      });
    }

    if (novaSenha.length < 8) {
      return res.status(400).json({
        error: "A nova senha precisa ter pelo menos 8 caracteres."
      });
    }

    const result = await pool.query(
      `
      SELECT id
      FROM jogadores
      WHERE LOWER(email) = $1
      AND cpf = $2
      LIMIT 1
      `,
      [email, cpf]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "E-mail e CPF não conferem."
      });
    }

    const senhaHash = await bcrypt.hash(
      novaSenha,
      12
    );

    await pool.query(
      `
      UPDATE jogadores
      SET senha = $1
      WHERE id = $2
      `,
      [
        senhaHash,
        result.rows[0].id
      ]
    );

    res.json({
      ok: true,
      message: "Senha alterada com sucesso."
    });

  } catch (erro) {
    console.error("ERRO NA RECUPERAÇÃO:", erro);

    res.status(500).json({
      error: "Erro ao recuperar senha."
    });
  }
});

/* =========================
   ADMIN LOGIN
========================= */

app.post("/api/admin/setup", async (req, res) => {
  try {
    const setupKey = String(
      req.body.setupKey || ""
    );

    const email = String(
      req.body.email || ""
    ).trim().toLowerCase();

    const senha = String(
      req.body.senha || ""
    );

    if (
      !process.env.ADMIN_SETUP_KEY ||
      setupKey !== process.env.ADMIN_SETUP_KEY
    ) {
      return res.status(403).json({
        error: "Chave de configuração inválida."
      });
    }

    if (!email || senha.length < 8) {
      return res.status(400).json({
        error: "Informe e-mail e uma senha de pelo menos 8 caracteres."
      });
    }

    const hash = await bcrypt.hash(
      senha,
      12
    );

    await pool.query(
      `
      INSERT INTO admins
      (
        email,
        senha
      )
      VALUES
      ($1, $2)
      ON CONFLICT (email)
      DO UPDATE SET senha = EXCLUDED.senha
      `,
      [
        email,
        hash
      ]
    );

    res.json({
      ok: true,
      message: "Administrador configurado."
    });

  } catch (erro) {
    console.error("ERRO NO ADMIN SETUP:", erro);

    res.status(500).json({
      error: "Erro ao configurar administrador."
    });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const email = String(
      req.body.email || ""
    ).trim().toLowerCase();

    const senha = String(
      req.body.senha || ""
    );

    const result = await pool.query(
      `
      SELECT id, email, senha
      FROM admins
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "E-mail ou senha incorretos."
      });
    }

    const admin = result.rows[0];

    const correta = await bcrypt.compare(
      senha,
      admin.senha
    );

    if (!correta) {
      return res.status(401).json({
        error: "E-mail ou senha incorretos."
      });
    }

    res.json({
      ok: true,
      admin: {
        id: admin.id,
        email: admin.email
      }
    });

  } catch (erro) {
    console.error("ERRO NO LOGIN ADMIN:", erro);

    res.status(500).json({
      error: "Erro interno."
    });
  }
});

/* =========================
   DASHBOARD ADMIN
========================= */

app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const jogadores = await pool.query(
      `SELECT COUNT(*)::int AS total FROM jogadores`
    );

    const pontos = await pool.query(
      `
      SELECT COALESCE(SUM(pontos), 0) AS total
      FROM jogadores
      `
    );

    let saquesPendentes = 0;
    let valorSaquesPendentes = 0;

    try {
      const saques = await pool.query(
        `
        SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(quantia), 0) AS valor
        FROM saques
        WHERE status = 'pendente'
        `
      );

      saquesPendentes = saques.rows[0].total;
      valorSaquesPendentes =
        Number(saques.rows[0].valor || 0);

    } catch (erro) {
      console.log(
        "Tabela saques ainda não disponível."
      );
    }

    res.json({
      ok: true,
      jogadores: jogadores.rows[0].total,
      pontos: Number(pontos.rows[0].total || 0),
      saquesPendentes,
      valorSaquesPendentes
    });

  } catch (erro) {
    console.error("ERRO DASHBOARD:", erro);

    res.status(500).json({
      error: "Erro ao carregar dashboard."
    });
  }
});

/* =========================
   LISTAR JOGADORES
========================= */

app.get("/api/admin/jogadores", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        email,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      FROM jogadores
      ORDER BY id DESC
      `
    );

    res.json({
      ok: true,
      jogadores: result.rows.map(jogador => ({
        ...jogador,
        pontos: Number(jogador.pontos || 0),
        equilibrio: Number(jogador.equilibrio || 0)
      }))
    });

  } catch (erro) {
    console.error("ERRO AO CARREGAR JOGADORES:", erro);

    res.status(500).json({
      error: "Erro ao carregar jogadores."
    });
  }
});

/* =========================
   SAQUES
========================= */

app.post("/api/saques", async (req, res) => {
  try {
    const {
      jogador_id,
      pix_key,
      quantia,
      valor_jogador,
      valor_plataforma,
      metodo,
      email
    } = req.body;

    const id = Number(jogador_id);
    const valor = Number(quantia);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Jogador inválido."
      });
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({
        error: "Valor de saque inválido."
      });
    }

    const jogador = await pool.query(
      `
      SELECT id, pontos, equilibrio
      FROM jogadores
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (jogador.rows.length === 0) {
      return res.status(404).json({
        error: "Jogador não encontrado."
      });
    }

    const saldoAtual =
      Number(jogador.rows[0].equilibrio || 0);

    if (valor > saldoAtual) {
      return res.status(400).json({
        error: "Saldo insuficiente."
      });
    }

    const saque = await pool.query(
      `
      INSERT INTO saques
      (
        jogador_id,
        pix_key,
        status,
        quantia,
        valor_jogador,
        valor_plataforma,
        metodo,
        email
      )
      VALUES
      ($1, $2, 'pendente', $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        id,
        pix_key || "",
        valor,
        Number(valor_jogador || valor),
        Number(valor_plataforma || 0),
        metodo || "Pix",
        email || ""
      ]
    );

    await pool.query(
      `
      UPDATE jogadores
      SET equilibrio = equilibrio - $1
      WHERE id = $2
      `,
      [
        valor,
        id
      ]
    );

    res.status(201).json({
      ok: true,
      saque: saque.rows[0]
    });

  } catch (erro) {
    console.error("ERRO AO CRIAR SAQUE:", erro);

    res.status(500).json({
      error: "Erro ao solicitar saque."
    });
  }
});

/* =========================
   INICIAR SERVIDOR
========================= */

prepararBanco()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `QuizUp Admin Backend rodando na porta ${PORT}`
      );
    });
  })
  .catch(erro => {
    console.error(
      "ERRO AO PREPARAR BANCO:",
      erro
    );

    process.exit(1);
  });
