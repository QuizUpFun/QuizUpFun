import { Client, Databases, Query } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    log("QuizUp Admin iniciado");

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

    const databases = new Databases(client);

    const DATABASE_ID = "6a8e11820008abab052e";

    const COLLECTIONS = {
      jogadores: "jogadores",
      parceiros: "parceiros",
      saques: "saques",
      movimentacoes: "movimentacoes_parceiros"
    };

    async function listarColecao(collectionId) {
      const resultado = await databases.listDocuments(
        DATABASE_ID,
        collectionId,
        [
          Query.limit(100)
        ]
      );

      return resultado.documents || [];
    }

    const jogadores =
      await listarColecao(COLLECTIONS.jogadores);

    const parceiros =
      await listarColecao(COLLECTIONS.parceiros);

    const saques =
      await listarColecao(COLLECTIONS.saques);

    const movimentacoes =
      await listarColecao(COLLECTIONS.movimentacoes);

    const saquesPorJogador = {};

    for (const saque of saques) {
      const usuario =
        saque["ID do usuário."] ||
        saque["ID do usuário"] ||
        saque.email ||
        saque.usuario ||
        saque.userId ||
        "desconhecido";

      if (!saquesPorJogador[usuario]) {
        saquesPorJogador[usuario] = {
          total: 0,
          pendentes: 0,
          aprovados: 0,
          cancelados: 0
        };
      }

      saquesPorJogador[usuario].total++;

      const status =
        String(saque.status || "")
          .toLowerCase()
          .trim();

      if (status === "pendente") {
        saquesPorJogador[usuario].pendentes++;
      }

      if (
        status === "aprovado" ||
        status === "aprovada"
      ) {
        saquesPorJogador[usuario].aprovados++;
      }

      if (
        status === "cancelado" ||
        status === "cancelada"
      ) {
        saquesPorJogador[usuario].cancelados++;
      }
    }

    const resumo = {
      jogadores: jogadores.length,

      parceiros: parceiros.length,

      saques: saques.length,

      movimentacoesParceiros:
        movimentacoes.length,

      saquesPendentes:
        saques.filter(
          s =>
            String(s.status || "")
              .toLowerCase()
              .trim() === "pendente"
        ).length,

      saquesAprovados:
        saques.filter(
          s =>
            ["aprovado", "aprovada"].includes(
              String(s.status || "")
                .toLowerCase()
                .trim()
            )
        ).length,

      saquesCancelados:
        saques.filter(
          s =>
            ["cancelado", "cancelada"].includes(
              String(s.status || "")
                .toLowerCase()
                .trim()
            )
        ).length
    };

    if (
      req.method === "POST" &&
      req.path === "/aprovar"
    ) {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

      const rowId = body.rowId;

      if (!rowId) {
        return res.json(
          {
            ok: false,
            message: "rowId não informado."
          },
          400
        );
      }

      const atualizado =
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.saques,
          rowId,
          {
            status: "aprovado"
          }
        );

      log(`Saque ${rowId} aprovado.`);

      return res.json({
        ok: true,
        message: "Saque aprovado com sucesso.",
        saque: atualizado
      });
    }

    if (
      req.method === "POST" &&
      req.path === "/cancelar"
    ) {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

      const rowId = body.rowId;

      if (!rowId) {
        return res.json(
          {
            ok: false,
            message: "rowId não informado."
          },
          400
        );
      }

      const atualizado =
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.saques,
          rowId,
          {
            status: "cancelado"
          }
        );

      log(`Saque ${rowId} cancelado.`);

      return res.json({
        ok: true,
        message: "Saque cancelado com sucesso.",
        saque: atualizado
      });
    }

    return res.json({
      ok: true,

      message:
        "QuizUp Admin funcionando!",

      resumo,

      dados: {
        jogadores,
        parceiros,
        saques,
        movimentacoesParceiros:
          movimentacoes
      },

      saquesPorJogador
    });

  } catch (e) {
    error(
      e?.message ||
      "Erro interno no QuizUp Admin."
    );

    return res.json(
      {
        ok: false,
        message:
          e?.message ||
          "Erro interno no QuizUp Admin."
      },
      500
    );
  }
};
