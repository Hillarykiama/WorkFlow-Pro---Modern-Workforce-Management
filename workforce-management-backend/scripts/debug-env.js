require('dotenv').config();

console.log("TURSO_DATABASE_URL:", JSON.stringify(process.env.TURSO_DATABASE_URL));
console.log("TURSO_AUTH_TOKEN (first 20 chars):", process.env.TURSO_AUTH_TOKEN?.slice(0, 20));
