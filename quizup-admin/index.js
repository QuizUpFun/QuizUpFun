import {
  Client,
  TablesDB,
  Query
} from "node-appwrite";

import crypto from "crypto";

/*
====================================================
 QUIZUP ADMIN — APPWRITE FUNCTION
 LOGIN SOMENTE COM E-MAIL
 Node.js / ES Module
====================================================
*/

// ==================================================
// CONFIGURAÇÕES
// ==================================================

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "";

const ADMIN_LOGIN_SECRET =
  process.env.ADMIN_LOGIN_SECRET || "";

const APPWRITE_ENDPOINT =
  process.env.APPWRITE_ENDPOINT ||
  "https://fra.cloud.appwrite.io/v1";

const APPWRITE_PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  "6a8e10e900245502244c";

const APPWRITE_API_KEY =
  process.env.APPWRITE_API_KEY || "";

const DATABASE_ID =
  process.env.DATABASE_ID ||
  "6a8e11820008abab052e";

const TABLE_JOGADORES = "jogadores";
const TABLE_SAQUES = "saques";
const TABLE_MENSAGENS = "mensagens";

// ==================================================
// CORS
// ==================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400"
  };
}

// ==================================================
// RESPOSTA JSON
// ==================================================

function json(res, status, data) {
  return res.json(
    data,
    status,
    corsHeaders()
  );
}

// ==================================================
// NORMALIZAR E-MAIL
// ==================================================

function normalizarEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

// ==================================================
// COMPARAÇÃO SEGURA
// ==================================================

function compararSeguro(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));

  if (aa.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    aa,
    bb
  );
}

// ==================================================
// CRIAR TOKEN ADMIN
// ==================================================

function criarToken() {

  const agora = Date.now();

  const payload = {
    tipo: "admin",
    criadoEm: agora,
    expiraEm:
      agora + (2 * 60 * 60 * 1000)
  };

  const dados =
    Buffer.from(
      JSON.stringify(payload)
    ).toString("base64url");

  const assinatura =
    crypto
      .createHmac(
        "sha256",
        ADMIN_LOGIN_SECRET
      )
      .update(dados)
      .digest("base64url");

  return `${dados}.${assinatura}`;
}

// ==================================================
// VERIFICAR TOKEN
// ==================================================

function verificarToken(token) {

  if (
    !token ||
    !ADMIN_LOGIN_SECRET
  ) {
    return false;
  }

  const partes =
    String(token).split(".");

  if (partes.length !== 2) {
    return false;
  }

  const [
    dados,
    assinatura
  ] = partes;

  const assinaturaEsperada =
    crypto
      .createHmac(
        "sha256",
        ADMIN_LOGIN_SECRET
      )
      .update(dados)
      .digest("base64url");

  if (
    !compararSeguro(
      assinatura,
      assinaturaEsperada
    )
  ) {
    return false;
  }

  try {

    const payload =
      JSON.parse(
        Buffer.from(
          dados,
          "base64url"
        ).toString("utf8")
      );

    if (
      payload.tipo !== "admin"
    ) {
      return false;
    }

    if (
      !payload.expiraEm ||
      Date.now() >
        Number(payload.expiraEm)
    ) {
      return false;
    }

    return true;

  } catch {
    return false;
  }
}

// ==================================================
// OBTER TOKEN DO CABEÇALHO
// ==================================================

function obterToken(req) {

  const authorization =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (!authorization) {
    return "";
  }

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return "";
  }

  return authorization
    .substring(7)
    .trim();
}

// ==================================================
// AUTORIZAÇÃO
// ==================================================

function autorizado(req) {

  const token =
    obterToken(req);

  return verificarToken(token);
}

// ==================================================
// CLIENT APPWRITE
// ==================================================

function criarAppwrite() {

  const client =
    new Client()
      .setEndpoint(
        APPWRITE_ENDPOINT
      )
      .setProject(
        APPWRITE_PROJECT_ID
      );

  if (APPWRITE_API_KEY) {
    client.setKey(
      APPWRITE_API_KEY
    );
  }

  const tablesDB =
    new TablesDB(client);

  return {
    client,
    tablesDB
  };
}

// ==================================================
// LOGIN SOMENTE COM E-MAIL
// ==================================================

async function login(
  req,
  res,
  log
) {

  try {

    let body = req.body;

    if (
      typeof body === "string"
    ) {
      try {
        body =
          JSON.parse(body);
      } catch {
        body = {};
      }
    }

    body = body || {};

    const email =
      normalizarEmail(
        body.email
      );

    log(
      `Tentativa de login administrativo: ${email}`
    );

    // ------------------------------
    // Verificações
    // ------------------------------

    if (!email) {

      return json(
        res,
        400,
        {
          sucesso: false,
          erro:
            "Informe o e-mail."
        }
      );
    }

    if (
      !ADMIN_EMAIL ||
      !ADMIN_LOGIN_SECRET
    ) {

      log(
        "ERRO: ADMIN_EMAIL ou ADMIN_LOGIN_SECRET não configurado."
      );

      return json(
        res,
        500,
        {
          sucesso: false,
          erro:
            "Configuração administrativa incompleta."
        }
      );
    }

    const emailAdmin =
      normalizarEmail(
        ADMIN_EMAIL
      );

    // ------------------------------
    // Verifica e-mail
    // ------------------------------

    const emailOk =
      compararSeguro(
        email,
        emailAdmin
      );

    if (!emailOk) {

      log(
        "Login recusado: e-mail não autorizado."
      );

      return json(
        res,
        401,
        {
          sucesso: false,
          erro:
            "E-mail não autorizado."
        }
      );
    }

    // ------------------------------
    // Cria token
    // ------------------------------

    const token =
      criarToken();

    log(
      "Login administrativo autorizado."
    );

    return json(
      res,
      200,
      {
        sucesso: true,
        token,
        tipo: "admin",
        expiraEm:
          Date.now() +
          (2 * 60 * 60 * 1000)
      }
    );

  } catch (erro) {

    log(
      `Erro no login: ${
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      500,
      {
        sucesso: false,
        erro:
          "Erro interno ao realizar login."
      }
    );
  }
}

// ==================================================
// RESUMO
// ==================================================

async function resumo(
  req,
  res,
  log
) {

  if (!autorizado(req)) {

    return json(
      res,
      401,
      {
        sucesso: false,
        erro:
          "Não autorizado."
      }
    );
  }

  try {

    const {
      tablesDB
    } = criarAppwrite();

    const jogadores =
      await tablesDB.listRows(
        DATABASE_ID,
        TABLE_JOGADORES,
        [
          Query.limit(5000)
        ]
      );

    const saques =
      await tablesDB.listRows(
        DATABASE_ID,
        TABLE_SAQUES,
        [
          Query.limit(5000)
        ]
      );

    const listaJogadores =
      jogadores.rows || [];

    const listaSaques =
      saques.rows || [];

    let pontosQuiz = 0;
    let pontosPatrocinados = 0;

    for (
      const jogador
      of listaJogadores
    ) {

      pontosQuiz += Number(
        jogador.pontos || 0
      );

      pontosPatrocinados +=
        Number(
          jogador.pontos_patrocinados ||
          jogador.pontosPatrocinados ||
          0
        );
    }

    const totalPontos =
      pontosQuiz +
      pontosPatrocinados;

    const saquesPendentes =
      listaSaques.filter(
        saque =>
          String(
            saque.status || ""
          ).toLowerCase() ===
          "pendente"
      ).length;

    const saquesAprovados =
      listaSaques.filter(
        saque =>
          String(
            saque.status || ""
          ).toLowerCase() ===
          "aprovado"
      ).length;

    const saquesRecusados =
      listaSaques.filter(
        saque => {

          const status =
            String(
              saque.status || ""
            ).toLowerCase();

          return (
            status === "recusado" ||
            status === "rejeitado"
          );
        }
      ).length;

    return json(
      res,
      200,
      {
        sucesso: true,

        totalUsuarios:
          listaJogadores.length,

        jogadoresAtivos:
          listaJogadores.length,

        pontosQuiz,

        pontosPatrocinados,

        totalPontos,

        saquesPendentes,

        saquesAprovados,

        saquesRecusados
      }
    );

  } catch (erro) {

    log(
      `Erro no resumo: ${
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      500,
      {
        sucesso: false,
        erro:
          "Erro ao carregar resumo."
      }
    );
  }
}

// ==================================================
// JOGADORES
// ==================================================

async function jogadores(
  req,
  res,
  log
) {

  if (!autorizado(req)) {

    return json(
      res,
      401,
      {
        sucesso: false,
        erro:
          "Não autorizado."
      }
    );
  }

  try {

    const {
      tablesDB
    } = criarAppwrite();

    const resultado =
      await tablesDB.listRows(
        DATABASE_ID,
        TABLE_JOGADORES,
        [
          Query.limit(5000)
        ]
      );

    return json(
      res,
      200,
      {
        sucesso: true,
        jogadores:
          resultado.rows || []
      }
    );

  } catch (erro) {

    log(
      `Erro jogadores: ${
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      500,
      {
        sucesso: false,
        erro:
          "Erro ao carregar jogadores."
      }
    );
  }
}

// ==================================================
// SAQUES
// ==================================================

async function saques(
  req,
  res,
  log
) {

  if (!autorizado(req)) {

    return json(
      res,
      401,
      {
        sucesso: false,
        erro:
          "Não autorizado."
      }
    );
  }

  try {

    const {
      tablesDB
    } = criarAppwrite();

    const resultado =
      await tablesDB.listRows(
        DATABASE_ID,
        TABLE_SAQUES,
        [
          Query.limit(5000)
        ]
      );

    return json(
      res,
      200,
      {
        sucesso: true,
        saques:
          resultado.rows || []
      }
    );

  } catch (erro) {

    log(
      `Erro saques: ${
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      500,
      {
        sucesso: false,
        erro:
          "Erro ao carregar saques."
      }
    );
  }
}

// ==================================================
// APROVAR SAQUE
// ==================================================

async function aprovarSaque(
  req,
  res,
  log
) {

  if (!autorizado(req)) {

    return json(
      res,
      401,
      {
        sucesso: false,
        erro:
          "Não autorizado."
      }
    );
  }

  try {

    let body = req.body;

    if (
      typeof body === "string"
    ) {
      try {
        body =
          JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const id =
      body?.id ||
      body?.saqueId ||
      body?.documentId;

    if (!id) {

      return json(
        res,
        400,
        {
          sucesso: false,
          erro:
            "ID do saque não informado."
        }
      );
    }

    const {
      tablesDB
    } = criarAppwrite();

    const atualizado =
      await tablesDB.updateRow(
        DATABASE_ID,
        TABLE_SAQUES,
        id,
        {
          status: "aprovado"
        }
      );

    log(
      `Saque ${id} aprovado.`
    );

    return json(
      res,
      200,
      {
        sucesso: true,
        saque: atualizado
      }
    );

  } catch (erro) {

    log(
      `Erro aprovar saque: ${
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      500,
      {
        sucesso: false,
        erro:
          "Erro ao aprovar saque."
      }
    );
  }
}

// ==================================================
// RECUSAR SAQUE
// ==================================================

async function recusarSaque(
  req,
  res,
  log
) {

  if (!autorizado(req)) {

    return json(
      res,
      401,
      {
        sucesso: false,
        erro:
          "Não autorizado."
      }
    );
  }

  try {

    let body = req.body;

    if (
      typeof body === "string"
    ) {
      try {
        body =
          JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const id =
      body?.id ||
      body?.saqueId ||
      body?.documentId;

    if (!id) {

      return json(
        res,
        400,
        {
          sucesso: false,
          erro:
            "ID do saque não informado."
        }
      );
    }

    const {
      tablesDB
    } = criarAppwrite();

    const atualizado =
      await tablesDB.updateRow(
        DATABASE_ID,
        TABLE_SAQUES,
        id,
        {
          status: "recusado"
        }
      );

    log(
      `Saque ${id} recusado.`
    );

    return json(
      res,
      200,
      {
        sucesso: true,
        saque: atualizado
      }
    );

  } catch (erro) {

    log(
      `Erro recusar saque: ${
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      500,
      {
        sucesso: false,
        erro:
          "Erro ao recusar saque."
      }
    );
  }
}

// ==================================================
// MENSAGENS
// ==================================================

async function mensagens(
  req,
  res,
  log
) {

  if (!autorizado(req)) {

    return json(
      res,
      401,
      {
        sucesso: false,
        erro:
          "Não autorizado."
      }
    );
  }

  try {

    const {
      tablesDB
    } = criarAppwrite();

    const resultado =
      await tablesDB.listRows(
        DATABASE_ID,
        TABLE_MENSAGENS,
        [
          Query.limit(5000)
        ]
      );

    return json(
      res,
      200,
      {
        sucesso: true,
        mensagens:
          resultado.rows || []
      }
    );

  } catch (erro) {

    log(
      `Erro mensagens: ${
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      200,
      {
        sucesso: true,
        mensagens: []
      }
    );
  }
}

// ==================================================
// MARCAR MENSAGEM COMO LIDA
// ==================================================

async function mensagemLida(
  req,
  res,
  log
) {

  if (!autorizado(req)) {

    return json(
      res,
      401,
      {
        sucesso: false,
        erro:
          "Não autorizado."
      }
    );
  }

  try {

    let body = req.body;

    if (
      typeof body === "string"
    ) {
      try {
        body =
          JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const id =
      body?.id ||
      body?.mensagemId ||
      body?.documentId;

    if (!id) {

      return json(
        res,
        400,
        {
          sucesso: false,
          erro:
            "ID da mensagem não informado."
        }
      );
    }

    const {
      tablesDB
    } = criarAppwrite();

    const atualizado =
      await tablesDB.updateRow(
        DATABASE_ID,
        TABLE_MENSAGENS,
        id,
        {
          lida: true
        }
      );

    log(
      `Mensagem ${id} marcada como lida.`
    );

    return json(
      res,
      200,
      {
        sucesso: true,
        mensagem: atualizado
      }
    );

  } catch (erro) {

    log(
      `Erro mensagem lida: ${
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      500,
      {
        sucesso: false,
        erro:
          "Erro ao marcar mensagem como lida."
      }
    );
  }
}

// ==================================================
// FUNÇÃO PRINCIPAL
// ==================================================

export default async ({
  req,
  res,
  log
}) => {

  try {

    const method =
      String(
        req.method || "GET"
      ).toUpperCase();

    const path =
      String(
        req.path || "/"
      ).split("?")[0];

    log(
      `QuizUp Admin: ${method} ${path}`
    );

    // ==============================================
    // CORS / OPTIONS
    // ==============================================

    if (
      method === "OPTIONS"
    ) {

      return res.empty(
        204,
        corsHeaders()
      );
    }

    // ==============================================
    // TESTE
    // ==============================================

    if (
      path === "/" &&
      method === "GET"
    ) {

      return json(
        res,
        200,
        {
          sucesso: true,
          sistema:
            "QuizUp Admin",
          status: "online"
        }
      );
    }

    if (
      path === "/teste" &&
      method === "GET"
    ) {

      return json(
        res,
        200,
        {
          sucesso: true,
          mensagem:
            "Function QuizUp Admin funcionando."
        }
      );
    }

    // ==============================================
    // LOGIN
    // ==============================================

    if (
      path === "/api/admin/login" &&
      method === "POST"
    ) {

      return await login(
        req,
        res,
        log
      );
    }

    // ==============================================
    // RESUMO
    // ==============================================

    if (
      path === "/api/admin/resumo" &&
      method === "GET"
    ) {

      return await resumo(
        req,
        res,
        log
      );
    }

    // ==============================================
    // JOGADORES
    // ==============================================

    if (
      path === "/api/admin/jogadores" &&
      method === "GET"
    ) {

      return await jogadores(
        req,
        res,
        log
      );
    }

    // ==============================================
    // SAQUES
    // ==============================================

    if (
      path === "/api/admin/saques" &&
      method === "GET"
    ) {

      return await saques(
        req,
        res,
        log
      );
    }

    // ==============================================
    // APROVAR SAQUE
    // ==============================================

    if (
      path === "/api/admin/saque/aprovar" &&
      method === "POST"
    ) {

      return await aprovarSaque(
        req,
        res,
        log
      );
    }

    // ==============================================
    // RECUSAR SAQUE
    // ==============================================

    if (
      path === "/api/admin/saque/recusar" &&
      method === "POST"
    ) {

      return await recusarSaque(
        req,
        res,
        log
      );
    }

    // ==============================================
    // MENSAGENS
    // ==============================================

    if (
      path === "/api/admin/mensagens" &&
      method === "GET"
    ) {

      return await mensagens(
        req,
        res,
        log
      );
    }

    // ==============================================
    // MENSAGEM LIDA
    // ==============================================

    if (
      path === "/api/admin/mensagem/lida" &&
      method === "POST"
    ) {

      return await mensagemLida(
        req,
        res,
        log
      );
    }

    // ==============================================
    // ROTA NÃO ENCONTRADA
    // ==============================================

    return json(
      res,
      404,
      {
        sucesso: false,
        erro:
          "Rota não encontrada.",
        caminho: path,
        metodo: method
      }
    );

  } catch (erro) {

    log(
      `ERRO GERAL: ${
        erro?.stack ||
        erro?.message ||
        String(erro)
      }`
    );

    return json(
      res,
      500,
      {
        sucesso: false,
        erro:
          "Erro interno da Function."
      }
    );
  }
};
