const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// =====================================================
// ROTA PRINCIPAL
// =====================================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "QuizUp Admin Backend funcionando!"
  });
});

// =====================================================
// TESTE DO BANCO
// =====================================================

app.get("/api/test-db", async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT NOW() AS agora"
    );

    res.json({
      status: "ok",
      banco: "PostgreSQL",
      hora: resultado.rows[0].agora
    });

  } catch (erro) {

    console.error("Erro no banco:", erro);

    res.status(500).json({
      status: "erro",
      mensagem: erro.message
    });
  }
});

// =====================================================
// PREPARAR BANCO
// =====================================================

async function prepararBanco() {

  try {

    // =================================================
    // ADMINS
    // =================================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela admins pronta.");

    // =================================================
    // JOGADORES
    // =================================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jogadores (
        id SERIAL PRIMARY KEY,
        nome_completo TEXT,
        email VARCHAR(255) UNIQUE NOT NULL,
        senha TEXT,
        cpf VARCHAR(20),
        codigo_indicacao VARCHAR(100),
        pontos INTEGER DEFAULT 0,
        equilibrio NUMERIC(12,2) DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela jogadores verificada.");

    // =================================================
    // PERGUNTAS
    // =================================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS perguntas (
        id SERIAL PRIMARY KEY,
        pergunta TEXT NOT NULL,
        alternativa_a TEXT,
        alternativa_b TEXT,
        alternativa_c TEXT,
        alternativa_d TEXT,
        resposta_correta VARCHAR(1),
        dificuldade VARCHAR(30),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela perguntas verificada.");

    // =================================================
    // PARCEIROS
    // =================================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS parceiros (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255),
        email VARCHAR(255),
        codigo VARCHAR(100),
        pontos INTEGER DEFAULT 0,
        valor NUMERIC(12,2) DEFAULT 0,
        status VARCHAR(30) DEFAULT 'ativo',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela parceiros verificada.");

    // =================================================
    // SAQUES
    // =================================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS saques (
        id SERIAL PRIMARY KEY,
        jogador_id INTEGER,
        email VARCHAR(255),
        pix_key TEXT,
        quantia NUMERIC(12,2),
        valor NUMERIC(12,2),
        metodo VARCHAR(50),
        status VARCHAR(30) DEFAULT 'pendente',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela saques verificada.");

    // =================================================
    // MONETAG
    // =================================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS monetag_relatorios (
        id SERIAL PRIMARY KEY,
        data DATE,
        impressoes INTEGER DEFAULT 0,
        profit NUMERIC(12,6) DEFAULT 0,
        cpm NUMERIC(12,6) DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela monetag_relatorios verificada.");

    // =================================================
    // SAC
    // =================================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sac_mensagens (
        id SERIAL PRIMARY KEY,
        jogador_id INTEGER,
        email VARCHAR(255),
        nome_completo TEXT,
        mensagem TEXT NOT NULL,
        resposta TEXT,
        status VARCHAR(30) DEFAULT 'pendente',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        respondido_em TIMESTAMP
      )
    `);

    console.log("Tabela sac_mensagens verificada.");

    console.log("Banco preparado.");

  } catch (erro) {

    console.error(
      "Erro ao preparar banco:",
      erro
    );

    throw erro;
  }
}

// =====================================================
// HILLTOP ADS
// =====================================================

async function atualizarSaldoHilltopAds() {

  try {

    const resposta = await fetch(
      "https://hilltopads.com/api/v1/publisher/balance",
      {
        headers: {
          Authorization:
            `Bearer ${process.env.HILLTOPADS_API_KEY}`
        }
      }
    );

    console.log(
      "HilltopAds HTTP:",
      resposta.status
    );

    if (!resposta.ok) {
      return;
    }

    const dados = await resposta.json();

    let saldo = null;

    if (
      typeof dados.balance === "number"
    ) {
      saldo = dados.balance;
    }

    if (
      dados.balance &&
      typeof dados.balance.amount === "number"
    ) {
      saldo = dados.balance.amount;
    }

    if (saldo !== null) {

      await pool.query(`
        UPDATE parceiros
        SET valor = $1
        WHERE LOWER(nome) LIKE '%hilltop%'
           OR LOWER(email) LIKE '%hilltop%'
      `, [saldo]);

      console.log(
        "Saldo HilltopAds salvo:",
        saldo
      );
    }

  } catch (erro) {

    console.error(
      "Erro ao atualizar HilltopAds:",
      erro.message
    );
  }
}

// =====================================================
// LOGIN ADMIN
// =====================================================

app.post("/api/admin/login", async (req, res) => {

  try {

    const {
      email,
      senha
    } = req.body;

    if (!email || !senha) {

      return res.status(400).json({
        sucesso: false,
        erro: "Informe e-mail e senha."
      });
    }

    const resultado = await pool.query(
      `
      SELECT
        id,
        nome,
        email,
        senha
      FROM admins
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email]
    );

    if (resultado.rows.length === 0) {

      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    const admin = resultado.rows[0];

    let senhaCorreta = false;

    try {

      senhaCorreta =
        await bcrypt.compare(
          senha,
          admin.senha
        );

    } catch (erro) {

      senhaCorreta =
        senha === admin.senha;
    }

    if (!senhaCorreta) {

      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    res.json({
      sucesso: true,
      admin: {
        id: admin.id,
        nome: admin.nome,
        email: admin.email
      }
    });

  } catch (erro) {

    console.error(
      "Erro no login admin:",
      erro
    );

    res.status(500).json({
      sucesso: false,
      erro: "Erro interno no login."
    });
  }
});

// =====================================================
// DASHBOARD
// =====================================================

app.get("/api/admin/dashboard", async (req, res) => {

  try {

    const jogadores =
      await pool.query(
        "SELECT COUNT(*) FROM jogadores"
      );

    const perguntas =
      await pool.query(
        "SELECT COUNT(*) FROM perguntas"
      );

    const saques =
      await pool.query(
        `
        SELECT COUNT(*)
        FROM saques
        WHERE status = 'pendente'
        `
      );

    const parceiros =
      await pool.query(
        "SELECT COUNT(*) FROM parceiros"
      );

    res.json({
      sucesso: true,
      jogadores:
        Number(jogadores.rows[0].count),
      perguntas:
        Number(perguntas.rows[0].count),
      saques_pendentes:
        Number(saques.rows[0].count),
      parceiros:
        Number(parceiros.rows[0].count)
    });

  } catch (erro) {

    console.error(
      "Erro dashboard:",
      erro
    );

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar dashboard."
    });
  }
});

// =====================================================
// JOGADORES — LISTAR
// =====================================================

app.get("/api/admin/jogadores", async (req, res) => {

  try {

    const resultado =
      await pool.query(`
        SELECT
          id,
          nome_completo,
          email,
          cpf,
          codigo_indicacao,
          pontos,
          equilibrio,
          criado_em
        FROM jogadores
        ORDER BY id DESC
      `);

    res.json({
      sucesso: true,
      jogadores: resultado.rows
    });

  } catch (erro) {

    console.error(
      "Erro jogadores:",
      erro
    );

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar jogadores."
    });
  }
});

// =====================================================
// JOGADOR — CONSULTAR
// =====================================================

app.get(
  "/api/admin/jogadores/:id",
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      const resultado =
        await pool.query(
          `
          SELECT *
          FROM jogadores
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

      if (
        resultado.rows.length === 0
      ) {

        return res.status(404).json({
          sucesso: false,
          erro: "Jogador não encontrado."
        });
      }

      res.json({
        sucesso: true,
        jogador: resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro jogador:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro: "Erro ao consultar jogador."
      });
    }
  }
);

// =====================================================
// JOGADOR — ATUALIZAR
// =====================================================

app.put(
  "/api/admin/jogadores/:id",
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      const {
        nome_completo,
        email,
        cpf,
        pontos,
        equilibrio
      } = req.body;

      const resultado =
        await pool.query(
          `
          UPDATE jogadores
          SET
            nome_completo = COALESCE($1, nome_completo),
            email = COALESCE($2, email),
            cpf = COALESCE($3, cpf),
            pontos = COALESCE($4, pontos),
            equilibrio = COALESCE($5, equilibrio)
          WHERE id = $6
          RETURNING *
          `,
          [
            nome_completo,
            email,
            cpf,
            pontos,
            equilibrio,
            id
          ]
        );

      if (
        resultado.rows.length === 0
      ) {

        return res.status(404).json({
          sucesso: false,
          erro: "Jogador não encontrado."
        });
      }

      res.json({
        sucesso: true,
        jogador: resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro atualizar jogador:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro: "Erro ao atualizar jogador."
      });
    }
  }
);

// =====================================================
// REGISTRO DO JOGADOR
// =====================================================

app.post("/api/jogadores/registrar", async (req, res) => {

  try {

    const {
      nome_completo,
      email,
      senha,
      cpf,
      codigo_indicacao
    } = req.body;

    if (
      !nome_completo ||
      !email ||
      !senha ||
      !cpf
    ) {

      return res.status(400).json({
        sucesso: false,
        erro: "Preencha todos os campos obrigatórios."
      });
    }

    const existente =
      await pool.query(
        `
        SELECT id
        FROM jogadores
        WHERE LOWER(email) = LOWER($1)
           OR cpf = $2
        LIMIT 1
        `,
        [
          email,
          cpf
        ]
      );

    if (
      existente.rows.length > 0
    ) {

      return res.status(400).json({
        sucesso: false,
        erro:
          "E-mail ou CPF já cadastrado."
      });
    }

    const senhaHash =
      await bcrypt.hash(
        senha,
        10
      );

    const resultado =
      await pool.query(
        `
        INSERT INTO jogadores (
          nome_completo,
          email,
          senha,
          cpf,
          codigo_indicacao,
          pontos,
          equilibrio
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          0,
          0
        )
        RETURNING
          id,
          nome_completo,
          email,
          cpf,
          codigo_indicacao,
          pontos,
          equilibrio,
          criado_em
        `,
        [
          nome_completo,
          String(email).toLowerCase(),
          senhaHash,
          cpf,
          codigo_indicacao || null
        ]
      );

    res.json({
      sucesso: true,
      jogador: resultado.rows[0]
    });

  } catch (erro) {

    console.error(
      "Erro registro jogador:",
      erro
    );

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao cadastrar jogador."
    });
  }
});

// =====================================================
// LOGIN DO JOGADOR
// =====================================================

app.post("/api/jogadores/login", async (req, res) => {

  try {

    const {
      email,
      senha
    } = req.body;

    const resultado =
      await pool.query(
        `
        SELECT *
        FROM jogadores
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
        `,
        [email]
      );

    if (
      resultado.rows.length === 0
    ) {

      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    const jogador =
      resultado.rows[0];

    const senhaCorreta =
      await bcrypt.compare(
        senha,
        jogador.senha
      );

    if (!senhaCorreta) {

      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    delete jogador.senha;

    res.json({
      sucesso: true,
      jogador
    });

  } catch (erro) {

    console.error(
      "Erro login jogador:",
      erro
    );

    res.status(500).json({
      sucesso: false,
      erro: "Erro no login."
    });
  }
});

// =====================================================
// RECUPERAÇÃO DE SENHA
// =====================================================

app.post(
  "/api/jogadores/recuperar",
  async (req, res) => {

    try {

      const {
        email,
        cpf,
        nova_senha
      } = req.body;

      if (
        !email ||
        !cpf ||
        !nova_senha
      ) {

        return res.status(400).json({
          sucesso: false,
          erro: "Preencha todos os campos."
        });
      }

      const jogador =
        await pool.query(
          `
          SELECT id
          FROM jogadores
          WHERE LOWER(email) = LOWER($1)
            AND cpf = $2
          LIMIT 1
          `,
          [
            email,
            cpf
          ]
        );

      if (
        jogador.rows.length === 0
      ) {

        return res.status(404).json({
          sucesso: false,
          erro:
            "E-mail e CPF não conferem."
        });
      }

      const senhaHash =
        await bcrypt.hash(
          nova_senha,
          10
        );

      await pool.query(
        `
        UPDATE jogadores
        SET senha = $1
        WHERE id = $2
        `,
        [
          senhaHash,
          jogador.rows[0].id
        ]
      );

      res.json({
        sucesso: true,
        mensagem:
          "Senha alterada com sucesso."
      });

    } catch (erro) {

      console.error(
        "Erro recuperação:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao recuperar senha."
      });
    }
  }
);

// =====================================================
// PERGUNTAS — ADMIN LISTAR
// =====================================================

app.get(
  "/api/admin/perguntas",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
          SELECT *
          FROM perguntas
          ORDER BY id DESC
        `);

      res.json({
        sucesso: true,
        perguntas: resultado.rows
      });

    } catch (erro) {

      console.error(
        "Erro perguntas:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro: "Erro ao carregar perguntas."
      });
    }
  }
);

// =====================================================
// PERGUNTAS — CRIAR
// =====================================================

app.post(
  "/api/admin/perguntas",
  async (req, res) => {

    try {

      const {
        pergunta,
        alternativa_a,
        alternativa_b,
        alternativa_c,
        alternativa_d,
        resposta_correta,
        dificuldade
      } = req.body;

      const resultado =
        await pool.query(
          `
          INSERT INTO perguntas (
            pergunta,
            alternativa_a,
            alternativa_b,
            alternativa_c,
            alternativa_d,
            resposta_correta,
            dificuldade
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
          RETURNING *
          `,
          [
            pergunta,
            alternativa_a,
            alternativa_b,
            alternativa_c,
            alternativa_d,
            resposta_correta,
            dificuldade
          ]
        );

      res.json({
        sucesso: true,
        pergunta:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro criar pergunta:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro: "Erro ao criar pergunta."
      });
    }
  }
);

// =====================================================
// PERGUNTAS — IMPORTAR
// =====================================================

app.post(
  "/api/admin/perguntas/importar",
  async (req, res) => {

    try {

      const perguntas =
        req.body.perguntas;

      if (
        !Array.isArray(perguntas)
      ) {

        return res.status(400).json({
          sucesso: false,
          erro:
            "Lista de perguntas inválida."
        });
      }

      let importadas = 0;

      for (
        const p of perguntas
      ) {

        await pool.query(
          `
          INSERT INTO perguntas (
            pergunta,
            alternativa_a,
            alternativa_b,
            alternativa_c,
            alternativa_d,
            resposta_correta,
            dificuldade
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
          `,
          [
            p.pergunta,
            p.alternativa_a,
            p.alternativa_b,
            p.alternativa_c,
            p.alternativa_d,
            p.resposta_correta,
            p.dificuldade
          ]
        );

        importadas++;
      }

      res.json({
        sucesso: true,
        importadas
      });

    } catch (erro) {

      console.error(
        "Erro importar perguntas:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao importar perguntas."
      });
    }
  }
);

// =====================================================
// PERGUNTAS — PÚBLICO
// =====================================================

app.get(
  "/api/perguntas",
  async (req, res) => {

    try {

      const {
        dificuldade
      } = req.query;

      let resultado;

      if (dificuldade) {

        resultado =
          await pool.query(
            `
            SELECT *
            FROM perguntas
            WHERE LOWER(dificuldade) =
                  LOWER($1)
            ORDER BY RANDOM()
            `,
            [dificuldade]
          );

      } else {

        resultado =
          await pool.query(
            `
            SELECT *
            FROM perguntas
            ORDER BY RANDOM()
            `
          );
      }

      res.json({
        sucesso: true,
        perguntas: resultado.rows
      });

    } catch (erro) {

      console.error(
        "Erro perguntas público:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao carregar perguntas."
      });
    }
  }
);

// =====================================================
// PARCEIROS — LISTAR
// =====================================================

app.get(
  "/api/admin/parceiros",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
          SELECT *
          FROM parceiros
          ORDER BY id DESC
        `);

      res.json({
        sucesso: true,
        parceiros: resultado.rows
      });

    } catch (erro) {

      console.error(
        "Erro parceiros:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao carregar parceiros."
      });
    }
  }
);

// =====================================================
// PARCEIROS — ATUALIZAR
// =====================================================

app.put(
  "/api/admin/parceiros/:id",
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      const {
        nome,
        email,
        codigo,
        pontos,
        valor,
        status
      } = req.body;

      const resultado =
        await pool.query(
          `
          UPDATE parceiros
          SET
            nome = COALESCE($1, nome),
            email = COALESCE($2, email),
            codigo = COALESCE($3, codigo),
            pontos = COALESCE($4, pontos),
            valor = COALESCE($5, valor),
            status = COALESCE($6, status)
          WHERE id = $7
          RETURNING *
          `,
          [
            nome,
            email,
            codigo,
            pontos,
            valor,
            status,
            id
          ]
        );

      if (
        resultado.rows.length === 0
      ) {

        return res.status(404).json({
          sucesso: false,
          erro:
            "Parceiro não encontrado."
        });
      }

      res.json({
        sucesso: true,
        parceiro:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro atualizar parceiro:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao atualizar parceiro."
      });
    }
  }
);

// =====================================================
// PARCEIROS — CRIAR
// =====================================================

app.post(
  "/api/admin/parceiros",
  async (req, res) => {

    try {

      const {
        nome,
        email,
        codigo,
        pontos,
        valor,
        status
      } = req.body;

      const resultado =
        await pool.query(
          `
          INSERT INTO parceiros (
            nome,
            email,
            codigo,
            pontos,
            valor,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          RETURNING *
          `,
          [
            nome,
            email,
            codigo,
            pontos || 0,
            valor || 0,
            status || "ativo"
          ]
        );

      res.json({
        sucesso: true,
        parceiro:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro criar parceiro:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao criar parceiro."
      });
    }
  }
);

// =====================================================
// MONETAG — LISTAR
// =====================================================

app.get(
  "/api/admin/monetag",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
          SELECT *
          FROM monetag_relatorios
          ORDER BY data DESC, id DESC
        `);

      res.json({
        sucesso: true,
        relatorios:
          resultado.rows
      });

    } catch (erro) {

      console.error(
        "Erro Monetag:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao carregar Monetag."
      });
    }
  }
);

// =====================================================
// MONETAG — IMPORTAR
// =====================================================

app.post(
  "/api/admin/monetag/importar",
  async (req, res) => {

    try {

      const relatorios =
        req.body.relatorios;

      if (
        !Array.isArray(relatorios)
      ) {

        return res.status(400).json({
          sucesso: false,
          erro:
            "Lista de relatórios inválida."
        });
      }

      let importados = 0;

      for (
        const item of relatorios
      ) {

        await pool.query(
          `
          INSERT INTO monetag_relatorios (
            data,
            impressoes,
            profit,
            cpm
          )
          VALUES (
            $1,
            $2,
            $3,
            $4
          )
          `,
          [
            item.data,
            Number(item.impressoes || 0),
            Number(item.profit || 0),
            Number(item.cpm || 0)
          ]
        );

        importados++;
      }

      res.json({
        sucesso: true,
        importados
      });

    } catch (erro) {

      console.error(
        "Erro importar Monetag:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao importar relatório Monetag."
      });
    }
  }
);

// =====================================================
// SAQUES — LISTAR
// =====================================================

app.get(
  "/api/admin/saques",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
          SELECT
            s.*,
            j.nome_completo
          FROM saques s
          LEFT JOIN jogadores j
            ON j.id = s.jogador_id
          ORDER BY s.id DESC
        `);

      res.json({
        sucesso: true,
        saques:
          resultado.rows
      });

    } catch (erro) {

      console.error(
        "Erro saques:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao carregar saques."
      });
    }
  }
);

// =====================================================
// SAQUES — ALTERAR STATUS
// =====================================================

app.patch(
  "/api/admin/saques/:id/status",
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      const {
        status
      } = req.body;

      const resultado =
        await pool.query(
          `
          UPDATE saques
          SET status = $1
          WHERE id = $2
          RETURNING *
          `,
          [
            status,
            id
          ]
        );

      if (
        resultado.rows.length === 0
      ) {

        return res.status(404).json({
          sucesso: false,
          erro:
            "Saque não encontrado."
        });
      }

      res.json({
        sucesso: true,
        saque:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro status saque:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao alterar saque."
      });
    }
  }
);

// =====================================================
// SAQUE — SOLICITAR
// =====================================================

app.post(
  "/api/saques",
  async (req, res) => {

    try {

      const {
        jogador_id,
        email,
        pix_key,
        quantia,
        valor,
        metodo
      } = req.body;

      const resultado =
        await pool.query(
          `
          INSERT INTO saques (
            jogador_id,
            email,
            pix_key,
            quantia,
            valor,
            metodo,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'pendente'
          )
          RETURNING *
          `,
          [
            jogador_id || null,
            email || null,
            pix_key || null,
            quantia || null,
            valor || null,
            metodo || "Pix"
          ]
        );

      res.json({
        sucesso: true,
        saque:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro solicitar saque:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao solicitar saque."
      });
    }
  }
);

// =====================================================
// SAC — JOGADOR ENVIA MENSAGEM
// =====================================================

app.post("/api/sac", async (req, res) => {

  try {

    let {
      jogador_id,
      email,
      nome_completo,
      mensagem
    } = req.body;

    if (
      !mensagem ||
      !String(mensagem).trim()
    ) {

      return res.status(400).json({
        sucesso: false,
        mensagem:
          "Digite uma mensagem."
      });
    }

    email = email
      ? String(email)
          .trim()
          .toLowerCase()
      : null;

    nome_completo = nome_completo
      ? String(nome_completo).trim()
      : null;

    // -----------------------------------------------
    // TENTA LOCALIZAR PELO E-MAIL
    // -----------------------------------------------

    if (
      !jogador_id &&
      email
    ) {

      const jogador =
        await pool.query(
          `
          SELECT
            id,
            email,
            nome_completo
          FROM jogadores
          WHERE LOWER(email) =
                LOWER($1)
          LIMIT 1
          `,
          [email]
        );

      if (
        jogador.rows.length > 0
      ) {

        jogador_id =
          jogador.rows[0].id;

        email =
          jogador.rows[0].email;

        nome_completo =
          jogador.rows[0].nome_completo;
      }
    }

    // -----------------------------------------------
    // TENTA LOCALIZAR PELO ID
    // -----------------------------------------------

    if (jogador_id) {

      const jogador =
        await pool.query(
          `
          SELECT
            id,
            email,
            nome_completo
          FROM jogadores
          WHERE id = $1
          LIMIT 1
          `,
          [jogador_id]
        );

      if (
        jogador.rows.length > 0
      ) {

        jogador_id =
          jogador.rows[0].id;

        email =
          jogador.rows[0].email;

        nome_completo =
          jogador.rows[0].nome_completo;
      }
    }

    // -----------------------------------------------
    // SALVAR
    // -----------------------------------------------

    const resultado =
      await pool.query(
        `
        INSERT INTO sac_mensagens (
          jogador_id,
          email,
          nome_completo,
          mensagem,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'pendente'
        )
        RETURNING *
        `,
        [
          jogador_id || null,
          email || null,
          nome_completo || null,
          String(mensagem).trim()
        ]
      );

    res.json({
      sucesso: true,
      mensagem:
        "Mensagem enviada com sucesso.",
      sac:
        resultado.rows[0]
    });

  } catch (erro) {

    console.error(
      "Erro SAC:",
      erro
    );

    res.status(500).json({
      sucesso: false,
      mensagem:
        "Erro ao enviar mensagem."
    });
  }
});

// =====================================================
// SAC — ADMIN LISTA MENSAGENS
// =====================================================

app.get(
  "/api/admin/sac",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
          SELECT
            id,
            jogador_id,
            email,
            nome_completo,
            mensagem,
            resposta,
            status,
            criado_em,
            respondido_em
          FROM sac_mensagens
          ORDER BY
            CASE
              WHEN status = 'pendente'
              THEN 0
              ELSE 1
            END,
            id DESC
        `);

      res.json({
        sucesso: true,
        mensagens:
          resultado.rows
      });

    } catch (erro) {

      console.error(
        "Erro listar SAC:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao carregar mensagens SAC."
      });
    }
  }
);

// =====================================================
// SAC — ADMIN RESPONDE
// =====================================================

app.patch(
  "/api/admin/sac/:id/responder",
  async (req, res) => {

    try {

      const sacId =
        Number(req.params.id);

      const resposta =
        String(
          req.body.resposta || ""
        ).trim();

      if (
        !Number.isInteger(sacId) ||
        sacId <= 0
      ) {

        return res.status(400).json({
          sucesso: false,
          erro:
            "ID da mensagem SAC inválido."
        });
      }

      if (!resposta) {

        return res.status(400).json({
          sucesso: false,
          erro:
            "Digite uma resposta."
        });
      }

      const resultado =
        await pool.query(
          `
          UPDATE sac_mensagens
          SET
            resposta = $1,
            status = 'respondido',
            respondido_em =
              CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING
            id,
            jogador_id,
            email,
            nome_completo,
            mensagem,
            resposta,
            status,
            criado_em,
            respondido_em
          `,
          [
            resposta,
            sacId
          ]
        );

      if (
        resultado.rows.length === 0
      ) {

        return res.status(404).json({
          sucesso: false,
          erro:
            "Mensagem SAC não encontrada."
        });
      }

      res.json({
        sucesso: true,
        mensagem:
          "Resposta salva com sucesso.",
        sac:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro responder SAC:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao responder mensagem SAC."
      });
    }
  }
);

// =====================================================
// SAC — JOGADOR CONSULTA SUA MENSAGEM E RESPOSTA
// =====================================================

app.get(
  "/api/sac/:id",
  async (req, res) => {

    try {

      const sacId =
        Number(req.params.id);

      if (
        !Number.isInteger(sacId) ||
        sacId <= 0
      ) {

        return res.status(400).json({
          sucesso: false,
          erro:
            "ID da mensagem SAC inválido."
        });
      }

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            mensagem,
            resposta,
            status,
            criado_em,
            respondido_em
          FROM sac_mensagens
          WHERE id = $1
          LIMIT 1
          `,
          [sacId]
        );

      if (
        resultado.rows.length === 0
      ) {

        return res.status(404).json({
          sucesso: false,
          erro:
            "Mensagem SAC não encontrada."
        });
      }

      res.json({
        sucesso: true,
        sac:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "Erro ao consultar resposta do SAC:",
        erro
      );

      res.status(500).json({
        sucesso: false,
        erro:
          "Erro ao consultar resposta do SAC."
      });
    }
  }
);

// =====================================================
// INICIAR SERVIDOR
// =====================================================

async function iniciarServidor() {

  try {

    await prepararBanco();

    await atualizarSaldoHilltopAds();

    app.listen(
      PORT,
      () => {

        console.log(
          `QuizUp Admin Backend rodando na porta ${PORT}`
        );

      }
    );

  } catch (erro) {

    console.error(
      "Erro ao iniciar servidor:",
      erro
    );

    process.exit(1);
  }
}

iniciarServidor();
