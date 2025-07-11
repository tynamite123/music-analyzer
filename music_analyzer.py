import os
import json
import librosa
import numpy as np
import argparse
import soundfile as sf

def visualize_drum_pattern(pattern):
    """Create a text-based visualization of the drum pattern"""
    bar = ""
    for i, hit in enumerate(pattern):
        bar += "X" if hit else "."
        if (i+1) % 4 == 0 and i < 15:  # Add space every 4 beats
            bar += " "
    return f"[{bar}]"

def analyze_audio(file_path, debug=False):
    """Analyze BPM, key, and drum pattern of an audio file"""
    print(f"Processing: {os.path.basename(file_path)}")
    
    # Load audio with higher quality settings
    y, sr = librosa.load(file_path, sr=44100, mono=True)
    
    # Focus analysis on first 60 seconds
    analysis_duration = 60
    if len(y) > analysis_duration * sr:
        y = y[:analysis_duration * sr]
        print(f"  Analyzing first {analysis_duration} seconds only")
    
    # Pre-process audio
    y = librosa.effects.trim(y, top_db=20)[0]
    y_percussive = librosa.effects.percussive(y)
    
    # Enhanced BPM Detection
    onset_env = librosa.onset.onset_strength(y=y_percussive, sr=sr, hop_length=512)
    
    # Handle different librosa versions for tempo detection
    try:
        # For librosa 0.10.0+
        from librosa.feature.rhythm import tempo as librosa_tempo
        candidates = librosa_tempo(onset_envelope=onset_env, 
                                  sr=sr, 
                                  aggregate=None,
                                  ac_size=16.0)
    except (ImportError, AttributeError):
        # For older librosa versions
        candidates = librosa.beat.tempo(onset_envelope=onset_env, 
                                       sr=sr, 
                                       aggregate=None,
                                       ac_size=16.0)
    
    # Target BPM range for electronic music
    HOUSE_RANGE = (120, 140)
    
    # Find best candidate in target range
    best_candidate = None
    for candidate in candidates:
        if HOUSE_RANGE[0] <= candidate <= HOUSE_RANGE[1]:
            best_candidate = candidate
            break
    
    # Handle half-tempo cases
    if best_candidate is None:
        for candidate in candidates:
            if 60 <= candidate <= 70:
                doubled = candidate * 2
                if HOUSE_RANGE[0] <= doubled <= HOUSE_RANGE[1]:
                    best_candidate = doubled
                    break
    
    # Fallback to median candidate
    if best_candidate is None:
        best_candidate = np.median(candidates)
        if best_candidate < 100:
            best_candidate *= 2
    
    tempo = best_candidate
    
    # Beat tracking with corrected tempo
    try:
        beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr, tempo=tempo, units='frames')[1]
    except:
        beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr, units='frames')[1]
    
    # Convert to float
    tempo = float(tempo)
    
    # DEBUG: Generate click track to verify beat alignment
    if debug:
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        clicks = librosa.clicks(beat_times, sr=sr, length=len(y))
        debug_audio = y + clicks
        debug_file = os.path.splitext(file_path)[0] + "_debug.wav"
        sf.write(debug_file, debug_audio, sr)
        print(f"  Debug file saved: {os.path.basename(debug_file)}")
    
    # Key Detection
    y_harmonic = librosa.effects.harmonic(y)
    chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr)
    key_map = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    key_index = np.argmax(np.mean(chroma, axis=1))
    key = key_map[key_index]
    
    # Drum Pattern Analysis
    drum_frames = librosa.onset.onset_detect(onset_envelope=onset_env, 
                                            units='frames',
                                            backtrack=False)
    drum_times = librosa.frames_to_time(drum_frames, sr=sr)
    
    # Convert beat times
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    
    # Handle short beat sequences
    if len(beat_times) < 16:
        print(f"  Warning: Only {len(beat_times)} beats detected in {os.path.basename(file_path)}")
    
    drum_pattern = []
    # Process first 16 beats
    for beat_time in beat_times[:16]:
        start = max(0, beat_time - 0.05)
        end = start + 60.0/tempo
        drum_hits = sum((drum_times >= start) & (drum_times < end))
        drum_pattern.append(1 if drum_hits > 0 else 0)
    
    # Pad with zeros if drum pattern is too short
    if len(drum_pattern) < 16:
        drum_pattern += [0] * (16 - len(drum_pattern))
    
    # Convert values for JSON
    drum_pattern = [int(x) for x in drum_pattern]
    bpm = round(tempo, 1)
    
    return {
        "filename": os.path.basename(file_path),
        "bpm": bpm,
        "key": key,
        "drum_pattern": drum_pattern
    }

def analyze_folder(folder_path, debug=False):
    """Analyze all audio files in a folder"""
    results = []
    audio_exts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a']
    
    for file in os.listdir(folder_path):
        if any(file.lower().endswith(ext) for ext in audio_exts):
            file_path = os.path.join(folder_path, file)
            try:
                result = analyze_audio(file_path, debug=debug)
                results.append(result)
                # Display drum pattern visualization
                pattern_vis = visualize_drum_pattern(result['drum_pattern'])
                print(f"  BPM: {result['bpm']}, Key: {result['key']}, Drum: {pattern_vis}")
            except Exception as e:
                print(f"Error processing {file}: {str(e)}")
    
    # Save results
    output_file = os.path.join(folder_path, "music_analysis.json")
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\nAnalysis complete! Results saved to {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Analyze music files for BPM, key, and drum patterns')
    parser.add_argument('folder', help='Path to folder containing audio files')
    parser.add_argument('--debug', action='store_true', help='Generate debug WAV files with click tracks')
    args = parser.parse_args()
    
    analyze_folder(args.folder, debug=args.debug)