export default {
	uuid: "date-statistics-extension",
	name: "date-statistics",
	description: "Displays current date and system statistics",
	exposeAction: false,
	exposeExtension: true,
	exposeAITool: false,
	runAs: "admin",
	groupsAllowed: ["admin", "users"],
	parameters: [],
	returnType: "string",
	returnContentType: "text/html",
	returnDescription: "HTML page with date and stats",

	async run(ctx, _args) {
		const { nodeService, authenticationContext } = ctx;

		// 1. Get statistics
		// List root folder to get a sense of total items
		const rootItemsOrErr = await nodeService.list(
			authenticationContext,
			"--root--",
		);
		let rootCount = 0;
		let fileCount = 0;
		let folderCount = 0;

		if (rootItemsOrErr.isRight()) {
			const items = rootItemsOrErr.value;
			rootCount = items.length;
			fileCount = items.filter((n) => n.mimetype !== "application/vnd.antbox.folder").length;
			folderCount = items.filter((n) => n.mimetype === "application/vnd.antbox.folder").length;
		}

		// 2. Current Date
		const now = new Date();
		const dateStr = now.toLocaleDateString(undefined, {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
		});
		const timeStr = now.toLocaleTimeString();

		// 3. User Info
		const userEmail = authenticationContext.principal.email;

		// 4. Generate HTML
		return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Date & Statistics</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 40px;
            background: #f0f2f5;
            color: #1a1a1a;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .card {
            background: white;
            border-radius: 16px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            padding: 40px;
            width: 100%;
            max-width: 600px;
            text-align: center;
        }
        .date {
            font-size: 1.2rem;
            color: #666;
            margin-bottom: 0.5rem;
        }
        .time {
            font-size: 3rem;
            font-weight: 700;
            color: #2563eb;
            margin-bottom: 2rem;
            font-variant-numeric: tabular-nums;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid #e5e7eb;
        }
        .stat-item {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .stat-value {
            font-size: 1.5rem;
            font-weight: 600;
        }
        .stat-label {
            font-size: 0.875rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .user-info {
            margin-top: 2rem;
            font-size: 0.875rem;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="date">${dateStr}</div>
        <div class="time">${timeStr}</div>
        
        <div class="stats-grid">
            <div class="stat-item">
                <span class="stat-value">${rootCount}</span>
                <span class="stat-label">Root Items</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${folderCount}</span>
                <span class="stat-label">Folders</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${fileCount}</span>
                <span class="stat-label">Files</span>
            </div>
        </div>

        <div class="user-info">
            Logged in as: ${userEmail}
        </div>
    </div>
    <script>
        // Update time client-side every second
        setInterval(() => {
            document.querySelector('.time').textContent = new Date().toLocaleTimeString();
        }, 1000);
    </script>
</body>
</html>
        `.trim();
	},
};
