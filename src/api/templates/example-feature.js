/**
 * Folder Content Summary Extension
 *
 * This extension receives a folder ID and returns an HTML page with
 * a comprehensive summary of the folder's content, including:
 * - Number of files in the folder
 * - Total size used by all file nodes
 * - Breakdown by file types
 * - Last modified information
 *
 * This extension runs with "admin" privileges and is exposed as a web endpoint.
 */

export default {
  uuid: "folder-content-summary-extension",
  name: "folder-content-summary",
  description:
    "Generates HTML reports showing comprehensive folder statistics including file counts, total size, file type breakdown, and size distribution.",

  exposeAction: false,
  runOnCreates: false,
  runOnUpdates: false,
  runManually: true,
  filters: [],

  exposeExtension: true,
  exposeAITool: false,

  runAs: "admin",
  groupsAllowed: ["admin", "managers"],

  parameters: [
    {
      name: "folderId",
      type: "string",
      required: true,
      description: "UUID of the folder to analyze",
    },
  ],

  returnType: "file",
  returnContentType: "text/html",
  returnDescription:
    "HTML page with comprehensive folder content summary including statistics, file type breakdown, and visual charts",

  /**
   * Main execution function for the folder summary extension
   * @param {Object} ctx - The run context containing authentication and services
   * @param {Object} args - Arguments including folder ID
   * @returns {string} HTML content for the summary page
   */
  async run(ctx, args) {
    const { nodeService, authenticationContext } = ctx;
    const { folderId } = args;

    if (!folderId) {
      throw new Error("Missing folder ID parameter");
    }

    // Verify folder exists and user has access
    const folderResult = await nodeService.get(authenticationContext, folderId);
    if (folderResult.isLeft()) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    const folder = folderResult.value;

    // Get all children of the folder
    const childrenResult = await nodeService.list(
      authenticationContext,
      folderId,
    );
    if (childrenResult.isLeft()) {
      throw new Error("Failed to fetch folder contents");
    }

    const children = childrenResult.value;

    // Analyze folder contents
    const analysis = analyzeFolderContents(children);

    // Generate and return HTML response
    return generateSummaryPage(folder, analysis);
  },
};

/**
 * Analyzes the contents of a folder to generate summary statistics
 * @param {Array} children - Array of child nodes in the folder
 * @returns {Object} Analysis results with file counts, sizes, and breakdowns
 */
function analyzeFolderContents(children) {
  const analysis = {
    totalFiles: 0,
    totalFolders: 0,
    totalSize: 0,
    fileTypes: new Map(),
    lastModified: null,
    sizeDistribution: {
      small: 0, // < 1MB
      medium: 0, // 1MB - 10MB
      large: 0, // 10MB - 100MB
      xlarge: 0, // > 100MB
    },
  };

  for (const child of children) {
    // Check if it's a file or folder
    if (child.mimetype === "application/vnd.antbox.folder") {
      analysis.totalFolders++;
    } else {
      analysis.totalFiles++;

      // Get file size if available
      const size = child.size || 0;
      analysis.totalSize += size;

      // Categorize by size
      const sizeMB = size / (1024 * 1024);
      if (sizeMB < 1) analysis.sizeDistribution.small++;
      else if (sizeMB < 10) analysis.sizeDistribution.medium++;
      else if (sizeMB < 100) analysis.sizeDistribution.large++;
      else analysis.sizeDistribution.xlarge++;

      // Track file types
      const mimeType = child.mimetype || "unknown";
      const count = analysis.fileTypes.get(mimeType) || 0;
      analysis.fileTypes.set(mimeType, count + 1);

      // Track most recent modification
      if (child.lastModified) {
        const modDate = new Date(child.lastModified);
        if (!analysis.lastModified || modDate > analysis.lastModified) {
          analysis.lastModified = modDate;
        }
      }
    }
  }

  return analysis;
}

/**
 * Generates an HTML page displaying folder content summary
 * @param {Object} folder - The folder node being analyzed
 * @param {Object} analysis - Analysis results from analyzeFolderContents
 * @returns {string} HTML content for the summary page
 */
function generateSummaryPage(folder, analysis) {
  const totalItems = analysis.totalFiles + analysis.totalFolders;
  const formattedSize = formatFileSize(analysis.totalSize);

  // Convert file types map to sorted array
  const fileTypesList = Array.from(analysis.fileTypes.entries())
    .sort((a, b) => b[1] - a[1]) // Sort by count, descending
    .slice(0, 10); // Top 10 file types

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Folder Summary: ${escapeHtml(folder.title)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
            color: #333;
        }
        .header {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .folder-title {
            font-size: 2em;
            margin: 0 0 10px 0;
            color: #2c3e50;
        }
        .folder-path {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-title {
            font-size: 1.1em;
            font-weight: 600;
            margin-bottom: 15px;
            color: #2c3e50;
        }
        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #3498db;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        .file-types-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .file-type-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #ecf0f1;
        }
        .file-type-item:last-child {
            border-bottom: none;
        }
        .file-type-name {
            font-weight: 500;
        }
        .file-type-count {
            background: #3498db;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8em;
        }
        .size-bar {
            display: flex;
            height: 30px;
            background: #ecf0f1;
            border-radius: 4px;
            overflow: hidden;
            margin: 10px 0;
        }
        .size-segment {
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 0.8em;
            font-weight: 500;
        }
        .size-small { background: #27ae60; }
        .size-medium { background: #f39c12; }
        .size-large { background: #e67e22; }
        .size-xlarge { background: #e74c3c; }
        .timestamp {
            color: #7f8c8d;
            font-size: 0.9em;
            text-align: center;
            margin-top: 30px;
            padding: 20px;
            background: white;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="folder-title">${escapeHtml(folder.title)}</h1>
        <div class="folder-path">Folder ID: ${escapeHtml(folder.uuid)}</div>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-title">Total Items</div>
            <div class="stat-value">${totalItems}</div>
            <div class="stat-label">${analysis.totalFiles} files, ${analysis.totalFolders} folders</div>
        </div>

        <div class="stat-card">
            <div class="stat-title">Total Size</div>
            <div class="stat-value">${formattedSize.value}</div>
            <div class="stat-label">${formattedSize.unit}</div>
        </div>

        <div class="stat-card">
            <div class="stat-title">File Types</div>
            <ul class="file-types-list">
                ${fileTypesList
                  .map(
                    ([type, count]) => `
                    <li class="file-type-item">
                        <span class="file-type-name">${escapeHtml(getMimeTypeLabel(type))}</span>
                        <span class="file-type-count">${count}</span>
                    </li>
                `,
                  )
                  .join("")}
                ${
                  fileTypesList.length === 0
                    ? '<li class="file-type-item">No files found</li>'
                    : ""
                }
            </ul>
        </div>

        <div class="stat-card">
            <div class="stat-title">Size Distribution</div>
            <div class="size-bar">
                ${generateSizeBar(analysis.sizeDistribution, analysis.totalFiles)}
            </div>
            <div style="font-size: 0.8em; color: #7f8c8d; margin-top: 5px;">
                Small (&lt;1MB): ${analysis.sizeDistribution.small} •
                Medium (1-10MB): ${analysis.sizeDistribution.medium} •
                Large (10-100MB): ${analysis.sizeDistribution.large} •
                X-Large (&gt;100MB): ${analysis.sizeDistribution.xlarge}
            </div>
        </div>
    </div>

    <div class="timestamp">
        Report generated on ${new Date().toLocaleString()}
        ${
          analysis.lastModified
            ? `• Last file modified: ${analysis.lastModified.toLocaleString()}`
            : ""
        }
    </div>
</body>
</html>`;
}

/**
 * Generates HTML for the size distribution bar chart
 * @param {Object} sizeDistribution - Object with size category counts
 * @param {number} totalFiles - Total number of files for percentage calculation
 * @returns {string} HTML for the size bar segments
 */
function generateSizeBar(sizeDistribution, totalFiles) {
  if (totalFiles === 0) {
    return '<div style="text-align: center; line-height: 30px;">No files</div>';
  }

  const segments = [
    { key: "small", class: "size-small", label: "S" },
    { key: "medium", class: "size-medium", label: "M" },
    { key: "large", class: "size-large", label: "L" },
    { key: "xlarge", class: "size-xlarge", label: "XL" },
  ];

  return segments
    .map((segment) => {
      const count = sizeDistribution[segment.key];
      const percentage = (count / totalFiles) * 100;

      return percentage > 0
        ? `<div class="size-segment ${segment.class}" style="width: ${percentage}%">${segment.label}</div>`
        : "";
    })
    .join("");
}

/**
 * Formats file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {Object} Object with value and unit properties
 */
function formatFileSize(bytes) {
  if (bytes === 0) return { value: "0", unit: "bytes" };

  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(1));

  return {
    value: value.toString(),
    unit: units[i],
  };
}

/**
 * Converts MIME type to human-readable label
 * @param {string} mimeType - The MIME type to convert
 * @returns {string} Human-readable label
 */
function getMimeTypeLabel(mimeType) {
  const typeMap = {
    "application/pdf": "PDF Documents",
    "image/jpeg": "JPEG Images",
    "image/png": "PNG Images",
    "image/gif": "GIF Images",
    "text/plain": "Text Files",
    "application/vnd.ms-excel": "Excel Spreadsheets",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "Excel Files (xlsx)",
    "application/msword": "Word Documents",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "Word Files (docx)",
    "video/mp4": "MP4 Videos",
    "audio/mpeg": "MP3 Audio",
    "application/zip": "ZIP Archives",
    unknown: "Unknown Type",
  };

  return typeMap[mimeType] || mimeType;
}

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
