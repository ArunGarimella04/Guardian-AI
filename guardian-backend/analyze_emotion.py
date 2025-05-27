from flask import Flask, request, jsonify
from pyAudioAnalysis import ShortTermFeatures as aF
from pyAudioAnalysis import audioBasicIO
from pydub import AudioSegment
import os
import numpy as np

app = Flask(__name__)

@app.route('/analyze', methods=['POST'])
def analyze_emotion():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No audio file uploaded'}), 400

        file = request.files['file']
        file_path = "temp_input"
        file.save(file_path)

        # Convert to .wav format
        wav_file_path = "temp.wav"
        audio = AudioSegment.from_file(file_path)
        audio.export(wav_file_path, format="wav")

        # Read audio file
        [Fs, x] = audioBasicIO.read_audio_file(wav_file_path)

        # Extract audio features
        features = aF.feature_extraction(x, Fs, 0.050 * Fs, 0.025 * Fs)

        # Example: Use energy and zero-crossing rate for emotion classification
        energy = np.mean(features[1])  # Short-term energy
        zcr = np.mean(features[0])    # Zero-crossing rate

        # Simple rule-based emotion classification
        if energy > 0.1 and zcr > 0.1:
            emotion = "angry"
        elif energy < 0.05 and zcr < 0.05:
            emotion = "calm"
        elif zcr > 0.15:
            emotion = "happy"
        else:
            emotion = "neutral"

        # Clean up temporary files
        os.remove(file_path)
        os.remove(wav_file_path)

        return jsonify({
            "emotion": emotion,
            "features": features.tolist()  # Optional: return extracted features
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': 'Internal Server Error', 'details': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)