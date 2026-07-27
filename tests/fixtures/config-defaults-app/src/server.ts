const port = process.env.PORT || 3000;
const region = process.env.REGION ?? "us-east-1";
const dbUrl = process.env.DATABASE_URL;
const mode = import.meta.env.VITE_MODE || "dev";