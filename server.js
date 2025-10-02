const express = require("express");
const mysql = require("mysql2/promise");
require("dotenv").config();
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: [
      "https://coin-pulse-jet.vercel.app/",
      "https://coin-pulse-jet.vercel.app",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const dbPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function actualizarMonedas() {
  console.log(
    `[${new Date().toISOString()}] Iniciando actualización de datos de CoinGecko...`
  );

  try {
    const API_KEY = process.env.COINGECKO_API_KEY;
    if (!API_KEY) {
      throw new Error(
        "La variable de entorno COINGECKO_API_KEY no está definida."
      );
    }

    const COINGECKO_URL = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&x_cg_demo_api_key=${API_KEY}`;

    const response = await fetch(COINGECKO_URL, {
      method: "GET",
      headers: {
        "x-cg-demo-api-key": API_KEY,
      },
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Error de la API: ${response.statusText}. Cuerpo: ${errorBody}`
      );
    }
    const monedas = await response.json();

    const valoresParaInsertar = monedas.map((moneda) => [
      moneda.name,
      moneda.symbol,
      moneda.image,
      moneda.current_price,
      moneda.market_cap_rank,
      moneda.market_cap,
      moneda.total_volume,
    ]);

    const sqlQuery = `
      INSERT INTO coingecko_data (nombre, simbolo, imagen, precio_actual, market_cap_rank, market_cap, volumen_total)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        nombre = VALUES(nombre),
        imagen = VALUES(imagen),
        precio_actual = VALUES(precio_actual),
        market_cap_rank = VALUES(market_cap_rank),
        market_cap = VALUES(market_cap),
        volumen_total = VALUES(volumen_total);
    `;

    const [result] = await dbPool.query(sqlQuery, [valoresParaInsertar]);

    console.log(
      `[${new Date().toISOString()}] Base de datos actualizada con éxito. Filas afectadas: ${
        result.affectedRows
      }`
    );
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error durante la actualización:`,
      error
    );
  }
}

app.get("/api/monedas", async (req, res) => {
  try {
    const [rows] = await dbPool.query(
      "SELECT * FROM coingecko_data ORDER BY market_cap_rank ASC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Error al consultar la base de datos" });
  }
});

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);

  actualizarMonedas();

  const quinceMinutos = 15 * 60 * 1000;
  setInterval(actualizarMonedas, quinceMinutos);
});
