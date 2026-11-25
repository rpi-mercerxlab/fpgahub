const express = require("express");
const http = require("http");
const app = express();
const port = 5000;

const cors = require("cors");

const session = require("express-session");
const MemoryStore = require("memorystore")(session);

const transactions = require("./transactions.js");

const authRouter = require("./authroutes.js");
const protectRoute = require("./middleware.js");
const fileTracking = require("./filetracking.js");
const frontendAPI = require("./frontend_services.js");

// Create shared session store
const sessionStore = new MemoryStore({
  checkPeriod: 1000 * 60 * 60,
});

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);

app.use(
  session({
    secret: "fake_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
    store: sessionStore,
  }),
);

app.use("/auth", authRouter);

app.use("/ft", fileTracking);

app.use("/api", protectRoute, frontendAPI);

app.use("/transactions", protectRoute, transactions);

// Create HTTP server
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
