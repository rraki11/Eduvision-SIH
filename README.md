# EduVision AI

A modern, futuristic Smart Education web application that transforms classroom teaching into interactive 3D learning.

## Features
- **Futuristic UI**: Dark theme, glassmorphism, and neon accents.
- **Voice Recognition**: Built-in speech-to-text (use the mic button) to speak concepts like "Human Heart" or "Solar System".
- **3D Visualization**: Real-time rendering of educational concepts using Three.js.
- **Backend AI Engine**: Python Flask API that processes natural language to detect concepts.

## Setup Instructions

### 1. Run the Backend API
The backend handles the NLP and concept detection logic.
1. Open a terminal.
2. Navigate to the `backend` directory.
3. Install dependencies: `pip install flask flask-cors`
4. Run the server: `python app.py`
5. The backend will start on `http://127.0.0.1:5000`.

### 2. Run the Frontend
The frontend is a static web app that uses ES6 modules.
1. Open the `frontend` folder in VS Code.
2. Use the **Live Server** extension to serve `index.html`.
3. Open the provided localhost URL in your browser.

### 3. Adding 3D Models
The code is fully configured to load `.glb` files. To see realistic models:
1. Download GLTF/GLB models for:
   - `heart.glb`
   - `solar_system.glb`
   - `dna.glb`
   - `earth.glb`
   - `gear.glb`
2. Place them in the `assets/models/` directory.

*(Note: If the models are not found, the application includes a smart Procedural Fallback Engine that will automatically generate and render primitive 3D shapes representing the concepts, ensuring your Hackathon demo never crashes!)*

## Tech Stack
- Frontend: HTML5, CSS3 (Glassmorphism), JavaScript (ES6), Three.js
- Backend: Python, Flask
- APIs: Web Speech API, Fetch API
