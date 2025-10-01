// server.js

const express = require("express");
const mysql = require("mysql2/promise"); // Usamos la versión con promesas para async/await
require("dotenv").config();
const cors = require("cors");

app.use(cors());

const app = express();
const PORT = process.env.PORT || 3001; // Render usa la variable de entorno PORT

// =================================================================
// 1. CONFIGURACIÓN DE LA BASE DE DATOS
// =================================================================
// Crea un "pool" de conexiones. Es más eficiente que crear una conexión por cada consulta.
// Las credenciales se leen desde variables de entorno para mayor seguridad.
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

// =================================================================
// 2. LÓGICA PRINCIPAL: OBTENER Y GUARDAR DATOS DE COINGECKO
// =================================================================
async function actualizarMonedas() {
  console.log(
    `[${new Date().toISOString()}] Iniciando actualización de datos de CoinGecko...`
  );

  try {
    // Obtenemos la API key desde las variables de entorno
    const API_KEY = process.env.COINGECKO_API_KEY;
    if (!API_KEY) {
      throw new Error(
        "La variable de entorno COINGECKO_API_KEY no está definida."
      );
    }

    // Construimos la URL dinámicamente para incluir la API key
    const COINGECKO_URL = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&x_cg_demo_api_key=${API_KEY}`;

    // Hacemos la llamada a la API usando fetch
    const response = await fetch(COINGECKO_URL, {
      method: "GET",
      headers: {
        "x-cg-demo-api-key": API_KEY,
      },
    });
    if (!response.ok) {
      const errorBody = await response.text(); // Leemos el cuerpo del error para más detalles
      throw new Error(
        `Error de la API: ${response.statusText}. Cuerpo: ${errorBody}`
      );
    }
    const monedas = await response.json();

    // Mapeamos los datos de la API a la estructura de nuestra tabla
    const valoresParaInsertar = monedas.map((moneda) => [
      moneda.name,
      moneda.symbol,
      moneda.image,
      moneda.current_price,
      moneda.market_cap_rank,
      moneda.market_cap,
      moneda.total_volume,
    ]);

    // 'INSERT ... ON DUPLICATE KEY UPDATE' intentará insertar una nueva fila.
    // Si falla porque la clave ÚNICA ('simbolo') ya existe, ejecutará la parte 'UPDATE'.
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

    // Ejecutamos la consulta en la base de datos con todos los valores a la vez.
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

// =================================================================
// 3. DEFINICIÓN DE LAS APIS PARA EL FRONTEND
// =================================================================

// Endpoint para que tu frontend pueda pedir todos los datos de las monedas
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

// Endpoint simple para que cron-job.org lo "pingee" y mantenga el servidor activo
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

// =================================================================
// 4. ARRANQUE DEL SERVIDOR Y LA TAREA PROGRAMADA
// =================================================================
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);

  // 1. Ejecutamos la función una vez al iniciar el servidor para tener datos frescos inmediatamente.
  actualizarMonedas();

  // 2. Configuramos setInterval para que ejecute la función cada 15 minutos.
  // 15 minutos * 60 segundos/minuto * 1000 milisegundos/segundo = 900000
  const quinceMinutos = 15 * 60 * 1000;
  setInterval(actualizarMonedas, quinceMinutos);
});
