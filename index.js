const sdk = require("node-appwrite");

/*
========================================================
 QUIZUP ADMIN - BACKEND
 Compatível com Node 26 / Appwrite Functions
========================================================
*/

const {
  Client,
  TablesDB,
  Query
} = sdk;


/*
========================================================
 CONFIGURAÇÃO
========================================================
*/

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT ||
  "https://fra.cloud.appwrite.io/v1";

const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  "6a8e10e900245502244c";

const API_KEY =
  process.env.APPWRITE_API_KEY || "";

const ADMIN_USER_ID =
  process.env.ADMIN_USER_ID ||
  "6a8f41f10032758d44de";

const DATABASE_ID =
  process.env.DATABASE_ID ||
  "QuizUpDB";

const JOGADORES_TABLE_ID =
  process.env.JOGADORES_TABLE_ID ||
  "jogadores";

const SAQUES_TABLE_ID =
  process.env.SAQUES_TABLE_ID ||
  "saques";

const MENSAGENS_TABLE_ID =
  process.env.MENSAGENS_TABLE_ID ||
  "mensagens";


/*
========================================================
 CLIENT APPWRITE
========================================================
*/

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID);

if (API_KEY) {
  client.setKey(API_KEY);
}

const tablesDB = new TablesDB(client);


/*
========================================================
 RESPOSTAS
========================================================
*/

function json(res, data, status = 200) {

  return res.json(
    data,
    status
  );

}


/*
========================================================
 PEGAR ID DO USUÁRIO QUE EXECUTOU A FUNÇÃO
========================================================
*/

function getUserId(req) {

  const headers =
    req.headers || {};

  return (
    headers["x-appwrite-user-id"] ||
    headers["X-Appwrite-User-Id"] ||
    ""
  );

}


/*
========================================================
 SEGURANÇA ADMIN
========================================================
*/

function verificarAdmin(req) {

  const userId =
    getUserId(req);

  if (!userId) {

    return {
      ok: false,
      erro:
        "Usuário não autenticado."
    };

  }


  if (
    userId !== ADMIN_USER_ID
  ) {

    return {
      ok: false,
      erro:
        "Acesso negado. Usuário não autorizado."
    };

  }


  return {
    ok: true
  };

}


/*
========================================================
 NORMALIZAR NÚMEROS
========================================================
*/

function num(valor) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return 0;
  }

  const numero =
    Number(valor);

  return Number.isFinite(numero)
    ? numero
    : 0;

}


/*
========================================================
 PRIMEIRO VALOR EXISTENTE
========================================================
*/

function valorDe(obj, nomes, padrao = "") {

  for (const nome of nomes) {

    if (
      obj &&
      obj[nome] !== undefined &&
      obj[nome] !== null
    ) {

      return obj[nome];

    }

  }

  return padrao;

}


/*
========================================================
 LISTAR LINHAS
========================================================
*/

async function listarTabela(
  tableId,
  queries = []
) {

  const resultado =
    await tablesDB.listRows({
      databaseId:
        DATABASE_ID,

      tableId:
        tableId,

      queries:
        queries,

      total:
        true
    });

  return resultado;

}


/*
========================================================
 RESUMO
========================================================
*/

async function resumo() {

  const jogadores =
    await listarTabela(
      JOGADORES_TABLE_ID
    );


  const saques =
    await listarTabela(
      SAQUES_TABLE_ID
    );


  let pontosQuiz = 0;
  let pontosPatrocinados = 0;
  let pontosTotal = 0;


  for (
    const jogador of jogadores.rows || []
  ) {

    const quiz =
      num(
        valorDe(
          jogador,
          [
            "pontosQuiz",
            "pontos_quiz",
            "pontos"
          ]
        )
      );


    const patrocinado =
      num(
        valorDe(
          jogador,
          [
            "pontosPatrocinados",
            "pontos_patrocinados",
            "pontosPatrocinados"
          ]
        )
      );


    const total =
      num(
        valorDe(
          jogador,
          [
            "pontosTotal",
            "pontos_total"
          ],
          quiz + patrocinado
        )
      );


    pontosQuiz +=
      quiz;

    pontosPatrocinados +=
      patrocinado;

    pontosTotal +=
      total;

  }


  let saquesPendentes = 0;
  let saquesAprovados = 0;
  let saquesRecusados = 0;


  for (
    const saque of saques.rows || []
  ) {

    const status =
      String(
        valorDe(
          saque,
          ["status"],
          ""
        )
      ).toUpperCase();


    if (
      status === "PENDENTE"
    ) {

      saquesPendentes++;

    } else if (
      status === "APROVADO"
    ) {

      saquesAprovados++;

    } else if (
      status === "RECUSADO"
    ) {

      saquesRecusados++;

    }

  }


  return {

    usuarios:
      jogadores.total ||
      jogadores.rows.length,

    jogadoresAtivos:
      jogadores.rows.filter(
        jogador =>
          valorDe(
            jogador,
            [
              "ativo",
              "status"
            ],
            true
          ) !== false &&
          String(
            valorDe(
              jogador,
              ["status"],
              "ATIVO"
            )
          ).toUpperCase() !==
          "INATIVO"
      ).length,

    pontosQuiz,

    pontosPatrocinados,

    pontosTotal,

    saquesPendentes,

    saquesAprovados,

    saquesRecusados

  };

}


/*
========================================================
 JOGADORES
========================================================
*/

async function jogadores() {

  const resultado =
    await listarTabela(
      JOGADORES_TABLE_ID
    );


  const lista =
    (resultado.rows || [])
      .map(jogador => {

        const pontosQuiz =
          num(
            valorDe(
              jogador,
              [
                "pontosQuiz",
                "pontos_quiz",
                "pontos"
              ]
            )
          );


        const pontosPatrocinados =
          num(
            valorDe(
              jogador,
              [
                "pontosPatrocinados",
                "pontos_patrocinados"
              ]
            )
          );


        const pontosTotal =
          num(
            valorDe(
              jogador,
              [
                "pontosTotal",
                "pontos_total"
              ],
              pontosQuiz +
              pontosPatrocinados
            )
          );


        return {

          idJogador:
            valorDe(
              jogador,
              [
                "idJogador",
                "id_usuario",
                "$id"
              ]
            ),

          nome:
            valorDe(
              jogador,
              [
                "nome",
                "name"
              ],
              "-"
            ),

          email:
            valorDe(
              jogador,
              [
                "email",
                "E-mail",
                "e_mail"
              ],
              "-"
            ),

          plano:
            valorDe(
              jogador,
              [
                "plano",
                "Plano"
              ],
              "normal"
            ),

          pontosQuiz,

          pontosPatrocinados,

          pontosTotal,

          saldo:
            num(
              valorDe(
                jogador,
                [
                  "equilibrio",
                  "saldo",
                  "balance"
                ]
              )
            ),

          ativo:
            valorDe(
              jogador,
              [
                "ativo"
              ],
              true
            )

        };

      });


  return {

    jogadores:
      lista,

    total:
      resultado.total ||
      lista.length

  };

}


/*
========================================================
 SAQUES
========================================================
*/

async function saques() {

  const resultado =
    await listarTabela(
      SAQUES_TABLE_ID
    );


  const lista =
    (resultado.rows || [])
      .map(saque => {

        const valorJogador =
          num(
            valorDe(
              saque,
              [
                "valor_jogador",
                "valorJogador",
                "quantia"
              ]
            )
          );


        const valorPlataforma =
          num(
            valorDe(
              saque,
              [
                "valor_plataforma",
                "valorPlataforma"
              ]
            )
          );


        return {

          id:
            valorDe(
              saque,
              [
                "$id",
                "id",
                "idSaque"
              ]
            ),

          data:
            valorDe(
              saque,
              [
                "criado_em",
                "criadoEm",
                "data",
                "$createdAt"
              ]
            ),

          nome:
            valorDe(
              saque,
              [
                "nome"
              ],
              "-"
            ),

          idJogador:
            valorDe(
              saque,
              [
                "ID do usuário",
                "id_usuario",
                "idJogador",
                "usuario_id"
              ],
              "-"
            ),

          email:
            valorDe(
              saque,
              [
                "e-mail",
                "email",
                "E-mail"
              ],
              "-"
            ),

          pontos:
            num(
              valorDe(
                saque,
                [
                  "pontos"
                ]
              )
            ),

          valorJogador,

          valorPlataforma,

          custoTotal:
            valorJogador +
            valorPlataforma,

          percentualPlataforma:
            valorJogador > 0
              ? (
                  valorPlataforma /
                  valorJogador
                ) * 100
              : 0,

          tipo:
            valorDe(
              saque,
              [
                "método",
                "metodo",
                "tipo"
              ],
              "PIX"
            ),

          destino:
            valorDe(
              saque,
              [
                "pix_key",
                "pixKey",
                "destino"
              ],
              "-"
            ),

          status:
            String(
              valorDe(
                saque,
                ["status"],
                "PENDENTE"
              )
            ).toUpperCase()

        };

      });


  return {

    saques:
      lista

  };

}


/*
========================================================
 ATUALIZAR SAQUE
========================================================
*/

async function atualizarSaque(
  idSaque,
  status,
  motivo = ""
) {

  if (!idSaque) {

    throw new Error(
      "ID do saque não informado."
    );

  }


  const dados = {
    status:
      status
  };


  if (motivo) {

    dados.motivo =
      motivo;

  }


  return await tablesDB.updateRow({

    databaseId:
      DATABASE_ID,

    tableId:
      SAQUES_TABLE_ID,

    rowId:
      idSaque,

    data:
      dados

  });

}


/*
========================================================
 MENSAGENS SAC
========================================================
*/

async function mensagens() {

  try {

    const resultado =
      await listarTabela(
        MENSAGENS_TABLE_ID
      );


    return {

      mensagens:
        (resultado.rows || [])
          .map(mensagem => ({

            id:
              valorDe(
                mensagem,
                [
                  "$id",
                  "id"
                ]
              ),

            email:
              valorDe(
                mensagem,
                [
                  "email",
                  "e-mail",
                  "E-mail"
                ],
                "-"
              ),

            mensagem:
              valorDe(
                mensagem,
                [
                  "mensagem",
                  "texto"
                ],
                ""
              ),

            data:
              valorDe(
                mensagem,
                [
                  "criado_em",
                  "data",
                  "$createdAt"
                ]
              ),

            status:
              String(
                valorDe(
                  mensagem,
                  [
                    "status"
                  ],
                  "NOVA"
                )
              ).toUpperCase()

          }))

    };

  } catch (erro) {

    /*
     * Caso a tabela de mensagens ainda não exista,
     * o painel continua funcionando.
     */

    console.error(
      "Tabela de mensagens:",
      erro.message
    );


    return {

      mensagens: []

    };

  }

}


/*
========================================================
 MARCAR MENSAGEM COMO LIDA
========================================================
*/

async function marcarMensagemLida(
  idMensagem
) {

  if (!idMensagem) {

    throw new Error(
      "ID da mensagem não informado."
    );

  }


  return await tablesDB.updateRow({

    databaseId:
      DATABASE_ID,

    tableId:
      MENSAGENS_TABLE_ID,

    rowId:
      idMensagem,

    data: {

      status:
        "LIDA"

    }

  });

}


/*
========================================================
 HANDLER PRINCIPAL
========================================================
*/

async function main(req, res) {

  try {

    console.log(
      "QuizUp Admin iniciado."
    );


    console.log(
      "Path:",
      req.path
    );


    /*
     * A execução manual pelo botão
     * "Executar" pode não possuir usuário.
     *
     * Por isso permitimos uma resposta
     * de diagnóstico somente quando
     * não existe usuário.
     */

    const userId =
      getUserId(req);


    if (
      userId &&
      userId !== ADMIN_USER_ID
    ) {

      return json(
        res,
        {
          sucesso: false,
          erro:
            "Acesso negado."
        },
        403
      );

    }


    const path =
      req.path || "/";

    const method =
      String(
        req.method || "GET"
      ).toUpperCase();


    /*
     * TESTE DA FUNÇÃO
     */

    if (
      path === "/" ||
      path === "/teste"
    ) {

      return json(
        res,
        {
          sucesso: true,

          mensagem:
            "QuizUp Admin funcionando.",

          function:
            "quizup-admin",

          runtime:
            "node-26",

          appwrite:
            true,

          usuario:
            userId || null
        }
      );

    }


    /*
     * SEGURANÇA
     */

    const seguranca =
      verificarAdmin(req);


    if (!seguranca.ok) {

      return json(
        res,
        {
          sucesso: false,
          erro:
            seguranca.erro
        },
        401
      );

    }


    /*
     * RESUMO
     */

    if (
      path === "/api/admin/resumo"
    ) {

      return json(
        res,
        await resumo()
      );

    }


    /*
     * JOGADORES
     */

    if (
      path === "/api/admin/jogadores"
    ) {

      return json(
        res,
        await jogadores()
      );

    }


    /*
     * SAQUES
     */

    if (
      path === "/api/admin/saques"
    ) {

      return json(
        res,
        await saques()
      );

    }


    /*
     * APROVAR SAQUE
     */

    if (
      path === "/api/admin/saque/aprovar" &&
      method === "POST"
    ) {

      const body =
        req.bodyJson ||
        {};


      const idSaque =
        body.idSaque;


      await atualizarSaque(
        idSaque,
        "APROVADO"
      );


      return json(
        res,
        {
          sucesso: true,
          mensagem:
            "Saque aprovado."
        }
      );

    }


    /*
     * RECUSAR SAQUE
     */

    if (
      path === "/api/admin/saque/recusar" &&
      method === "POST"
    ) {

      const body =
        req.bodyJson ||
        {};


      const idSaque =
        body.idSaque;


      const motivo =
        body.motivo ||
        "Solicitação recusada pelo administrador.";


      await atualizarSaque(
        idSaque,
        "RECUSADO",
        motivo
      );


      return json(
        res,
        {
          sucesso: true,
          mensagem:
            "Saque recusado."
        }
      );

    }


    /*
     * MENSAGENS
     */

    if (
      path === "/api/admin/mensagens"
    ) {

      return json(
        res,
        await mensagens()
      );

    }


    /*
     * MARCAR MENSAGEM COMO LIDA
     */

    if (
      path === "/api/admin/mensagem/lida" &&
      method === "POST"
    ) {

      const body =
        req.bodyJson ||
        {};


      await marcarMensagemLida(
        body.idMensagem
      );


      return json(
        res,
        {
          sucesso: true,
          mensagem:
            "Mensagem marcada como lida."
        }
      );

    }


    /*
     * ROTA NÃO ENCONTRADA
     */

    return json(
      res,
      {
        sucesso: false,
        erro:
          "Rota não encontrada.",
        path
      },
      404
    );


  } catch (erro) {

    console.error(
      "ERRO QUIZUP ADMIN:",
      erro
    );


    return json(
      res,
      {
        sucesso: false,

        erro:
          erro.message ||
          "Erro interno da função."
      },
      500
    );

  }

}


/*
========================================================
 EXPORTAÇÃO
========================================================

 IMPORTANTE:
 Não usar:
 export default

 No Node 26 desta função estamos usando
 CommonJS.
========================================================
*/

module.exports = {
  main
};
