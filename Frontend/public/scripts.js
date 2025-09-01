document.getElementById("uploadBtn").addEventListener("click", async () => {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a file first!");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("https://music-backend-785098527240.europe-west1.run.app/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    displayResult(result);
  } catch (err) {
    console.error("Upload failed:", err);
    alert("Upload failed, check console for details");
  }
});

function displayResult(data) {
  const container = document.getElementById("results");
  container.innerHTML = `
    <h3>Analysis Result</h3>
    <p><strong>Filename:</strong> ${data.filename}</p>
    <p><strong>BPM:</strong> ${data.bpm}</p>
    <p><strong>Key:</strong> ${data.key}</p>
    <p><strong>Energy:</strong> ${data.energy ?? "Not available"}</p>
    <p><strong>Loudness:</strong> ${data.loudness ?? "Not available"}</p>
    <p><strong>Danceability:</strong> ${data.danceability ?? "Not available"}</p>
    <p><strong>Spectral Centroid:</strong> ${data.spectral_centroid}</p>
    <p><strong>Spectral Bandwidth:</strong> ${data.spectral_bandwidth}</p>
    <p><strong>Spectral Rolloff:</strong> ${data.spectral_rolloff}</p>
  `;
}
