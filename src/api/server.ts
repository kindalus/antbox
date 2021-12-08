import express from "express";
import aspectsRouter from "./aspects_router";

import nodesRouter from "./nodes_router";
import uploadRouter from "./upload_router";
import webContentsRouter from "./web_contents_router";

const app = express();
app.use(express.json());

app.use("/nodes", nodesRouter);
app.use("/web-contents", webContentsRouter);
app.use("/aspects", aspectsRouter);
app.use("/upload", uploadRouter);




export default app;
