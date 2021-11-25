import express from "express";
import aspectsRouter from "./aspects_router.js";

import nodesRouter from "./nodes_router.js";
import uploadRouter from "./upload_router.js";
import webContentsRouter from "./web_contents_router.js";

const app = express();
app.use(express.json());

app.use("/nodes", nodesRouter);
app.use("/web-contents", webContentsRouter);
app.use("/aspects", aspectsRouter);
app.use("/upload", uploadRouter);




export default app;
