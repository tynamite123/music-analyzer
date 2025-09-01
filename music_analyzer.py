import os
import sys
import json
import librosa
import numpy as np

# Optional Essentia integration
try:
    import essentia
    import essentia.standard as es
    ESSENTIA_AVAILABLE = True
except ImportError:
    ESSENTIA_AVAILABLE = False
    print("⚠️ Essentia not found. Danceability, energy & loudness will be skipped.")

# Always save to uploads/music_analysis.json
OUTPUT_JSON = os.path.join("uploads", "music_analysis.json")

def round_value(value, digits=2):
    """Avoid deprecated behavior in NumPy 1.25+."""
    if hasattr(value, 'item'):
        value = value.item()
    return round(float(value), digits)

def extract_features(filepath):
    print(f"🔍 Analyzing {filepath}...")

    y, sr = librosa.load(filepath, sr=None)

    # Core features
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_idx = chroma.mean(axis=1).argmax()
    key = librosa.midi_to_note(key_idx + 12)

    # Spectral features
    spectral_centroid = round_value(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    spectral_bandwidth = round_value(np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr)))
    spectral_rolloff = round_value(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr)))

    energy = loudness = danceability = None
    if ESSENTIA_AVAILABLE:
        audio = es.MonoLoader(filename=filepath)()
        w = es.Windowing(type='hann')
        spectrum = es.Spectrum()
        frame_gen = es.FrameGenerator(audio, frameSize=1024, hopSize=512, startFromZero=True)

        energies = []
        loudnesses = []
        for frame in frame_gen:
            spec = spectrum(w(frame))
            energies.append(np.sum(spec))
            loudnesses.append(es.Loudness()(spec))

        energy = round_value(np.mean(energies), 2)
        loudness = round_value(np.mean(loudnesses), 2)
        danceability = round_value(es.Danceability()(audio), 3)

    return {
        "filename": os.path.basename(filepath),
        "bpm": round_value(tempo),
        "key": key,
        "energy": energy,
        "loudness": loudness,
        "danceability": danceability,
        "spectral_centroid": spectral_centroid,
        "spectral_bandwidth": spectral_bandwidth,
        "spectral_rolloff": spectral_rolloff
    }

def load_existing_data():
    if os.path.exists(OUTPUT_JSON):
        with open(OUTPUT_JSON, "r") as f:
            return json.load(f)
    return []

def save_data(data):
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, "w") as f:
        json.dump(data, f, indent=2)
    print(f"✅ Analysis written to {OUTPUT_JSON}")

def main(folder_or_file):
    existing_data = load_existing_data()
    filenames = {track["filename"] for track in existing_data}

    if os.path.isdir(folder_or_file):
        files = [os.path.join(folder_or_file, f) for f in os.listdir(folder_or_file) if f.lower().endswith(".mp3")]
    elif os.path.isfile(folder_or_file) and folder_or_file.lower().endswith(".mp3"):
        files = [folder_or_file]
    else:
        print("❌ Invalid file or folder path.")
        return

    for filepath in files:
        if os.path.basename(filepath) in filenames:
            print(f"⏩ Skipping {filepath} (already analyzed)")
            continue
        features = extract_features(filepath)
        existing_data.append(features)

    save_data(existing_data)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ Usage: python music_analyzer.py <file-or-folder>")
    else:
        main(sys.argv[1])
