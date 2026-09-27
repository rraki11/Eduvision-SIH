from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({"status": "EduVision AI Backend is running", "version": "1.0.0"})

@app.route('/api/detect-concept', methods=['POST'])
def detect_concept():
    data = request.json
    text = data.get('text', '').lower()
    
    concept = "Unknown"
    model_file = None
    description = ""
    
    if "heart" in text:
        concept = "Human Heart"
        model_file = "heart.glb"
        description = "The human heart is a muscular organ that pumps blood through the circulatory system."
    elif "solar" in text or "planet" in text or "astronomy" in text:
        concept = "Solar System"
        model_file = "solar_system_animation.glb"
        description = "An animated system for studying orbital motion and planetary relationships."
    elif "earth" in text or "layer" in text:
        concept = "Earth Layers"
        model_file = "earth.glb"
        description = "The Earth consists of several layers: the crust, the mantle, the outer core, and the inner core."
    elif "perspective" in text:
        concept = "Perspective Model"
        model_file = "perspective.glb"
        description = "A spatial engineering model for investigating form, scale, and perspective."
    elif "bridge" in text or "manhattan" in text or "civil" in text or "engineering" in text or "structure" in text or "station" in text:
        concept = "Manhattan Bridge"
        model_file = "lowpoly_manhattan_bridge.glb"
        description = "A structural model for studying civil infrastructure and bridge design."
        
    if model_file:
        return jsonify({
            "detected": True,
            "concept": concept,
            "model_file": model_file,
            "description": description,
            "confidence": 0.98
        })
    else:
        return jsonify({
            "detected": False,
            "message": "No matching 3D concept found."
        })

if __name__ == '__main__':
    print("Starting EduVision AI Backend on port 5000...")
    app.run(debug=True, port=5000)
