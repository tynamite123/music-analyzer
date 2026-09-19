const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const resultsDiv = document.getElementById("results");

async function uploadAndAnalyzeFile(file) {
  const formData = new FormData();
  formData.append("track", file);

  try {
    const response = await fetch("http://localhost:8080/upload", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const result = await response.json();
    const analyses = result.analysis ?? result.tracks ?? [];

    const analysis =
      analyses.find(item => (item.filename || item.originalName) === file.name) ||
      analyses[0];

    if (!analysis) {
      console.warn("No analysis returned for", file.name);
      return null;
    }

    displayResult(analysis);
    return analysis;
  } catch (err) {
    console.error("Upload failed:", err);
    resultsDiv.innerHTML = `<p style="color:red">Upload failed: ${err.message}</p>`;
    return null;
  }
}

function displayResult(analysis) {
  const div = document.createElement("div");
  const filename = analysis.filename || analysis.originalName || "Unknown file";

  div.innerHTML = `
    <h3>Analysis Result</h3>
    <p><strong>Filename:</strong> ${filename}</p>
    <p>BPM: ${analysis.bpm ?? "N/A"}</p>
    <p>Key: ${analysis.key ?? "N/A"}</p>
    <p>Energy: ${analysis.energy ?? "N/A"}</p>
    <p>Loudness: ${analysis.loudness ?? "N/A"}</p>
    <p>Danceability: ${analysis.danceability ?? "N/A"}</p>
    <p>Spectral Centroid: ${analysis.spectral_centroid ?? "N/A"}</p>
    <p>Spectral Bandwidth: ${analysis.spectral_bandwidth ?? "N/A"}</p>
    <p>Spectral Rolloff: ${analysis.spectral_rolloff ?? "N/A"}</p>
  `;
  resultsDiv.appendChild(div);
}

uploadBtn.addEventListener("click", async () => {
  const files = fileInput.files;
  if (!files.length) {
    alert("Please select at least one file!");
    return;
  }

  resultsDiv.innerHTML = "";

  for (const file of files) {
    const analysis = await uploadAndAnalyzeFile(file);
    if (analysis) {
      addToPlaylist(file, analysis); // from player.js
    }
  }
});
