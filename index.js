import { Client, TablesDB } from "node-appwrite";
import crypto from "crypto";

/*
=========================================================
QUIZUP ADMIN - APPWRITE FUNCTION
Node.js / ES MODULE
=========================================================
*/

/*
=========================================================
CONFIGURAÇÃO APPWRITE
=========================================================
*/

const ENDPOINT =
  process.env.APPWRITE_FUNCTION_API_ENDPOINT ||
  process.env.APPWRITE_ENDPOINT ||
  "https://fra.cloud.appwrite.io/v1";

const PROJECT_ID =
  process.env.APPWRITE_FUNCTION_PROJECT_ID ||
  process.env.APPWRITE_PROJECT_ID ||
  "6a8e10e900245502244c";

const API_KEY =
  process.env.APPWRITE_API_KEY ||
  "";


/*
=========================================================
ADMINISTRADOR
=========================================================
*/

const ADMIN_EMAIL =
  String(
    process.env.ADMIN_EMAIL || ""
  )
    .trim()
    .toLowerCase();

const ADMIN_DATA_NASCIMENTO =
  String(
    process.env.ADMIN_DATA_NASCIMENTO || ""
  )
    .trim();

const ADMIN_LOGIN_SECRET =
  String(
    process.env.ADMIN_LOGIN_SECRET || ""
  );

const ADMIN_USER_ID =
  String(
    process.env.ADMIN_USER_ID ||
    "6a8f41f10032758d44de"
  )
    .trim();


/*
=========================================================
TOKEN
=========================================================
*/

const TOKEN_DURACAO_SEGUNDOS =
  2 * 60 * 60;


/*
=========================================================
BANCO DE DADOS
=========================================================
*/

const DATABASE_ID =
  process.env.QUIZUP_DATABASE_ID ||
  process.env.DATABASE_ID ||
  "QuizUpDB";

const TABELA_JOGADORES =
  process.env.TABELA_JOGADORES ||
  process.env.JOGADORES_TABLE_ID ||
  "jogadores";

const TABELA_SAQUES =
  process.env.TABELA_SAQUES ||
  process.env.SAQUES_TABLE_ID ||
  "saques";

const TABELA_MENSAGENS =
  process.env.TABELA_MENSAGENS ||
  process.env.MENSAGENS_TABLE_ID ||
  "mensagens";


/*
=========================================================
CLIENTE APPWRITE
=========================================================
*/

const client =
  new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);

if (API_KEY) {
  client.setKey(API_KEY);
}

const tablesDB =
  new TablesDB(client);


/*
=========================================================
CORS
=========================================================
*/

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Appwrite-User-Id",
    "Access-Control-Max-Age":
      "86400"
  };
}


/*
=========================================================
JSON
=========================================================
*/

function json(res, status, data) {
  return res.json(
    data,
    status,
    corsHeaders()
  );
}


/*
=========================================================
NÚMERO
=========================================================
*/

function num(valor) {
  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : 0;
}


/*
=========================================================
VALOR
=========================================================
*/

function valorDe(obj) {

  if (!obj) {
    return 0;
  }

  return num(
    obj.quantia ??
    obj.valor ??
    obj.valor_jogador ??
    obj.equilibrio ??
    obj.saldo ??
    0
  );
}


/*
=========================================================
BODY
=========================================================
*/

function lerBody(req) {

  try {

    if (
      req.bodyJson &&
      typeof req.bodyJson === "object"
    ) {

      return req.bodyJson;

    }

  } catch (e) {

    console.error(
      "Erro bodyJson:",
      e
    );

  }


  try {

    if (
      req.bodyText &&
      typeof req.bodyText === "string"
    ) {

      return JSON.parse(
        req.bodyText
      );

    }

  } catch (e) {

    console.error(
      "Erro bodyText:",
      e
    );

  }


  return {};
}


/*
=========================================================
NORMALIZAR DATA
=========================================================
*/

function normalizarData(data) {

  const valor =
    String(data || "").trim();

  /*
  DD/MM/AAAA
  */

  const brasileira =
    /^(\d{2})\/(\d{2})\/(\d{4})$/
      .exec(valor);

  if (brasileira) {

    return (
      `${brasileira[3]}-` +
      `${brasileira[2]}-` +
      `${brasileira[1]}`
    );

  }

  /*
  AAAA-MM-DD
  */

  const iso =
    /^\d{4}-\d{2}-\d{2}$/
      .test(valor);

  if (iso) {
    return valor;
  }

  return valor;
}


/*
=========================================================
CRIAR TOKEN
=========================================================
*/

function criarToken() {

  const agora =
    Math.floor(
      Date.now() / 1000
    );

  const expira =
    agora +
    TOKEN_DURACAO_SEGUNDOS;

  const payload = {
    sub: "quizup-admin",
    iat: agora,
    exp: expira
  };

  const textoPayload =
    Buffer
      .from(
        JSON.stringify(payload)
      )
      .toString("base64url");

  const assinatura =
    crypto
      .createHmac(
        "sha256",
        ADMIN_LOGIN_SECRET
      )
      .update(textoPayload)
      .digest("base64url");

  return (
    textoPayload +
    "." +
    assinatura
  );
}


/*
=========================================================
VALIDAR TOKEN
=========================================================
*/

function validarToken(token) {

  if (
    !token ||
    !ADMIN_LOGIN_SECRET
  ) {

    return false;

  }

  const partes =
    String(token).split(".");

  if (
    partes.length !== 2
  ) {

    return false;

  }

  const [
    payloadCodificado,
    assinatura
  ] = partes;

  const assinaturaEsperada =
    crypto
      .createHmac(
        "sha256",
        ADMIN_LOGIN_SECRET
      )
      .update(payloadCodificado)
      .digest("base64url");

  if (
    assinatura !==
    assinaturaEsperada
  ) {

    return false;

  }

  try {

    const payload =
      JSON.parse(
        Buffer
          .from(
            payloadCodificado,
            "base64url"
          )
          .toString("utf8")
      );

    const agora =
      Math.floor(
        Date.now() / 1000
      );

    if (
      !payload.exp ||
      Number(payload.exp) < agora
    ) {

      return false;

    }

    if (
      payload.sub !==
      "quizup-admin"
    ) {

      return false;

    }

    return true;

  } catch (e) {

    return false;

  }
}


/*
=========================================================
VERIFICAR ADMIN
=========================================================
*/

function verificarAdmin(req) {

  const headers =
    req.headers || {};

  /*
  TOKEN DO PAINEL
  */

  const authorization =
    headers.authorization ||
    headers.Authorization ||
    "";

  if (
    String(
      authorization
    ).startsWith("Bearer ")
  ) {

    const token =
      String(
        authorization
      )
        .substring(7)
        .trim();

    if (
      validarToken(token)
    ) {

      return true;

    }

  }


  /*
  USUÁRIO APPWRITE
  */

  const appwriteUserId =
    headers["x-appwrite-user-id"] ||
    headers["X-Appwrite-User-Id"] ||
    "";

  if (
    appwriteUserId &&
    appwriteUserId ===
    ADMIN_USER_ID
  ) {

    return true;

  }


  return false;
}


/*
=========================================================
LISTAR TABELA
=========================================================
*/

async function listarTabela(
  tabela,
  queries = []
) {

  const resultado =
    await tablesDB.listRows({

      databaseId:
        DATABASE_ID,

      tableId:
        tabela,

      queries:
        queries

    });

  return (
    resultado.rows ||
    []
  );
}


/*
=========================================================
LOGIN
=========================================================
*/

async function login(
  req,
  res
) {

  const body =
    lerBody(req);

  const email =
    String(
      body.email || ""
    )
      .trim()
      .toLowerCase();

  const dataNascimento =
    String(
      body.dataNascimento ||
      body.data_nascimento ||
      body.data ||
      ""
    ).trim();


  if (
    !email ||
    !dataNascimento
  ) {

    return json(
      res,
      400,
      {
        success: false,
        error:
          "E-mail e data de nascimento são obrigatórios."
      }
    );

  }


  /*
  VERIFICA CONFIGURAÇÃO
  */

  if (
    !ADMIN_EMAIL ||
    !ADMIN_DATA_NASCIMENTO ||
    !ADMIN_LOGIN_SECRET
  ) {

    console.error(
      "CONFIGURAÇÃO ADMINISTRATIVA AUSENTE."
    );

    return json(
      res,
      500,
      {
        success: false,
        error:
          "Login administrativo não configurado no servidor."
      }
    );

  }


  const dataInformada =
    normalizarData(
      dataNascimento
    );

  const dataConfigurada =
    normalizarData(
      ADMIN_DATA_NASCIMENTO
    );


  /*
  VERIFICA E-MAIL
  */

  if (
    email !==
    ADMIN_EMAIL
  ) {

    return json(
      res,
      401,
      {
        success: false,
        error:
          "E-mail ou data de nascimento inválidos."
      }
    );

  }


  /*
  VERIFICA DATA
  */

  if (
    dataInformada !==
    dataConfigurada
  ) {

    return json(
      res,
      401,
      {
        success: false,
        error:
          "E-mail ou data de nascimento inválidos."
      }
    );

  }


  /*
  LOGIN OK
  */

  const token =
    criarToken();

  return json(
    res,
    200,
    {

      success: true,

      token,

      expiresIn:
        TOKEN_DURACAO_SEGUNDOS,

      admin: {
        email:
          ADMIN_EMAIL
      }

    }
  );
}


/*
=========================================================
RESUMO
=========================================================
*/

async function resumo(
  req,
  res
) {

  if (
    !verificarAdmin(req)
  ) {

    return json(
      res,
      401,
      {
        success: false,
        error:
          "Não autorizado."
      }
    );

  }


  try {

    const jogadores =
      await listarTabela(
        TABELA_JOGADORES
      );

    let totalPontos = 0;
    let totalSaldo = 0;
    let jogadoresAtivos = 0;


    for (
      const jogador of jogadores
    ) {

      totalPontos +=
        num(
          jogador.pontos
        );

      totalSaldo +=
        valorDe(
          jogador
        );


      if (
        jogador.ativo === true ||
        jogador.status === "ativo" ||
        jogador.online === true
      ) {

        jogadoresAtivos++;

      }

    }


    let saques = [];

    try {

      saques =
        await listarTabela(
          TABELA_SAQUES
        );

    } catch (e) {

      console.error(
        "Erro ao carregar saques:",
        e
      );

    }


    let saquesPendentes = 0;
    let saquesAprovados = 0;
    let saquesRecusados = 0;


    for (
      const saque of saques
    ) {

      const status =
        String(
          saque.status || ""
        )
          .trim()
          .toLowerCase();


      if (
        status === "pendente"
      ) {

        saquesPendentes++;

      }

      if (
        status === "aprovado"
      ) {

        saquesAprovados++;

      }

      if (
        status === "recusado"
      ) {

        saquesRecusados++;

      }

    }


    return json(
      res,
      200,
      {

        success: true,

        totalUsuarios:
          jogadores.length,

        usuarios:
          jogadores.length,

        totalJogadores:
          jogadores.length,

        jogadoresAtivos,

        pontosQuiz:
          totalPontos,

        pontos:
          totalPontos,

        totalPontos,

        pontosPatrocinados:
          0,

        totalSaldo,

        saquesPendentes,

        pendentes:
          saquesPendentes,

        saquesAprovados,

        aprovados:
          saquesAprovados,

        saquesRecusados,

        recusados:
          saquesRecusados

      }
    );

  } catch (e) {

    console.error(
      "ERRO RESUMO:",
      e
    );

    return json(
      res,
      500,
      {
        success: false,
        error:
          "Erro ao carregar resumo.",
        details:
          String(
            e?.message || e
          )
      }
    );

  }
}


/*
=========================================================
JOGADORES
=========================================================
*/

async function jogadores(
  req,
  res
) {

  if (
    !verificarAdmin(req)
  ) {

    return json(
      res,
      401,
      {
        success: false,
        error:
          "Não autorizado."
      }
    );

  }


  try {

    const lista =
      await listarTabela(
        TABELA_JOGADORES
      );

    return json(
      res,
      200,
      {

        success: true,

        jogadores:
          lista

      }
    );

  } catch (e) {

    console.error(
      "ERRO JOGADORES:",
      e
    );

    return json(
      res,
      500,
      {

        success: false,

        error:
          "Erro ao carregar jogadores.",

        details:
          String(
            e?.message || e
          )

      }
    );

  }
}


/*
=========================================================
SAQUES
=========================================================
*/

async function saques(
  req,
  res
) {

  if (
    !verificarAdmin(req)
  ) {

    return json(
      res,
      401,
      {
        success: false,
        error:
          "Não autorizado."
      }
    );

  }


  try {

    const lista =
      await listarTabela(
        TABELA_SAQUES
      );

    return json(
      res,
      200,
      {

        success: true,

        saques:
          lista

      }
    );

  } catch (e) {

    console.error(
      "ERRO SAQUES:",
      e
    );

    return json(
      res,
      500,
      {

        success: false,

        error:
          "Erro ao carregar saques.",

        details:
          String(
            e?.message || e
          )

      }
    );

  }
}


/*
=========================================================
ATUALIZAR SAQUE
=========================================================
*/

async function atualizarSaque(
  req,
  res,
  novoStatus
) {

  if (
    !verificarAdmin(req)
  ) {

    return json(
      res,
      401,
      {
        success: false,
        error:
          "Não autorizado."
      }
    );

  }


  const body =
    lerBody(req);

  const id =
    String(
      body.id ||
      body.saqueId ||
      body.documentId ||
      ""
    ).trim();


  if (!id) {

    return json(
      res,
      400,
      {
        success: false,
        error:
          "ID do saque não informado."
      }
    );

  }


  try {

    const atualizado =
      await tablesDB.updateRow({

        databaseId:
          DATABASE_ID,

        tableId:
          TABELA_SAQUES,

        rowId:
          id,

        data: {
          status:
            novoStatus
        }

      });


    return json(
      res,
      200,
      {

        success: true,

        status:
          novoStatus,

        saque:
          atualizado

      }
    );

  } catch (e) {

    console.error(
      "ERRO ATUALIZAR SAQUE:",
      e
    );

    return json(
      res,
      500,
      {

        success: false,

        error:
          "Erro ao atualizar saque.",

        details:
          String(
            e?.message || e
          )

      }
    );

  }
}


/*
=========================================================
MENSAGENS
=========================================================
*/

async function mensagens(
  req,
  res
) {

  if (
    !verificarAdmin(req)
  ) {

    return json(
      res,
      401,
      {
        success: false,
        error:
          "Não autorizado."
      }
    );

  }


  try {

    const lista =
      await listarTabela(
        TABELA_MENSAGENS
      );

    return json(
      res,
      200,
      {

        success: true,

        mensagens:
          lista

      }
    );

  } catch (e) {

    console.error(
      "ERRO MENSAGENS:",
      e
    );

    /*
    A tabela pode ainda não existir.
    Não derruba o painel.
    */

    return json(
      res,
      200,
      {

        success: true,

        mensagens: []

      }
    );

  }
}


/*
=========================================================
MARCAR MENSAGEM COMO LIDA
=========================================================
*/

async function marcarMensagemLida(
  req,
  res
) {

  if (
    !verificarAdmin(req)
  ) {

    return json(
      res,
      401,
      {
        success: false,
        error:
          "Não autorizado."
      }
    );

  }


  const body =
    lerBody(req);

  const id =
    String(
      body.id ||
      body.mensagemId ||
      body.documentId ||
      ""
    ).trim();


  if (!id) {

    return json(
      res,
      400,
      {
        success: false,
        error:
          "ID da mensagem não informado."
      }
    );

  }


  try {

    const atualizado =
      await tablesDB.updateRow({

        databaseId:
          DATABASE_ID,

        tableId:
          TABELA_MENSAGENS,

        rowId:
          id,

        data: {
          status:
            "lida"
        }

      });


    return json(
      res,
      200,
      {

        success: true,

        mensagem:
          atualizado

      }
    );

  } catch (e) {

    console.error(
      "ERRO MENSAGEM:",
      e
    );

    return json(
      res,
      500,
      {

        success: false,

        error:
          "Erro ao atualizar mensagem.",

        details:
          String(
            e?.message || e
          )

      }
    );

  }
}


/*
=========================================================
TESTE
=========================================================
*/

async function teste(
  req,
  res
) {

  return json(
    res,
    200,
    {

      ok: true,

      success: true,

      function:
        "quizup-admin",

      status:
        "online",

      runtime:
        "node-26",

      timestamp:
        new Date().toISOString()

    }
  );
}


/*
=========================================================
HANDLER APPWRITE
=========================================================
*/

export default async function main({
  req,
  res,
  log,
  error
}) {

  try {

    const method =
      String(
        req.method || "GET"
      ).toUpperCase();

    const caminho =
      String(
        req.path || "/"
      );


    log(
      `QuizUp Admin: ${method} ${caminho}`
    );


    /*
    =====================================================
    CORS PREFLIGHT
    =====================================================
    */

    if (
      method === "OPTIONS"
    ) {

      return res.empty(
        204,
        corsHeaders()
      );

    }


    /*
    =====================================================
    TESTE
    =====================================================
    */

    if (
      caminho === "/" ||
      caminho === "/teste"
    ) {

      return teste(
        req,
        res
      );

    }


    /*
    =====================================================
    LOGIN
    =====================================================
    */

    if (
      caminho === "/api/admin/login" &&
      method === "POST"
    ) {

      return login(
        req,
        res
      );

    }


    /*
    =====================================================
    RESUMO
    =====================================================
    */

    if (
      (
        caminho === "/api/admin/resumo" ||
        caminho === "/resumo"
      )
    ) {

      return resumo(
        req,
        res
      );

    }


    /*
    =====================================================
    JOGADORES
    =====================================================
    */

    if (
      (
        caminho === "/api/admin/jogadores" ||
        caminho === "/jogadores"
      )
    ) {

      return jogadores(
        req,
        res
      );

    }


    /*
    =====================================================
    SAQUES
    =====================================================
    */

    if (
      (
        caminho === "/api/admin/saques" ||
        caminho === "/saques"
      )
    ) {

      return saques(
        req,
        res
      );

    }


    /*
    =====================================================
    APROVAR SAQUE
    =====================================================
    */

    if (
      caminho ===
        "/api/admin/saque/aprovar" &&
      method === "POST"
    ) {

      return atualizarSaque(
        req,
        res,
        "aprovado"
      );

    }


    /*
    =====================================================
    RECUSAR SAQUE
    =====================================================
    */

    if (
      caminho ===
        "/api/admin/saque/recusar" &&
      method === "POST"
    ) {

      return atualizarSaque(
        req,
        res,
        "recusado"
      );

    }


    /*
    =====================================================
    MENSAGENS
    =====================================================
    */

    if (
      caminho ===
        "/api/admin/mensagens"
    ) {

      return mensagens(
        req,
        res
      );

    }


    /*
    =====================================================
    MENSAGEM LIDA
    =====================================================
    */

    if (
      caminho ===
        "/api/admin/mensagem/lida" &&
      method === "POST"
    ) {

      return marcarMensagemLida(
        req,
        res
      );

    }


    /*
    =====================================================
    404
    =====================================================
    */

    return json(
      res,
      404,
      {

        success: false,

        error:
          "Rota não encontrada.",

        path:
          caminho

      }
    );


  } catch (e) {

    console.error(
      "ERRO FATAL DA FUNCTION:",
      e
    );

    if (error) {
      error(
        String(
          e?.stack ||
          e?.message ||
          e
        )
      );
    }

    return json(
      res,
      500,
      {

        success: false,

        error:
          "Erro interno da Function.",

        details:
          String(
            e?.message ||
            e
          )

      }
    );

  }

}
