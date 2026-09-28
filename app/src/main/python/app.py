import os
from flask import Flask, jsonify, send_file

app = Flask(__name__, static_folder='static', static_url_path='/static')

DOWNLOADS_FOLDER = '/storage/emulated/0/Download'
VIDEO_EXTENSIONS = ('.mp4', '.mkv', '.webm', '.avi')
MEDIA_DB = {}

def scan_downloads():
    MEDIA_DB.clear()
    media_list = []
    file_id_counter = 1
    
    if not os.path.exists(DOWNLOADS_FOLDER):
        return media_list

    for root, dirs, files in os.walk(DOWNLOADS_FOLDER):
        for file in files:
            if file.lower().endswith(VIDEO_EXTENSIONS):
                file_path = os.path.join(root, file)
                file_id = str(file_id_counter)
                
                MEDIA_DB[file_id] = file_path
                
                media_list.append({
                    "id": file_id,
                    "title": os.path.splitext(file)[0],
                    "thumbnail": "https://picsum.photos/600/400",
                    "stream_url": f"/api/stream/{file_id}",
                    "duration": "00:00:00"
                })
                file_id_counter += 1
                
    return media_list

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/media')
def get_media():
    return jsonify({
        "status": "success",
        "data": scan_downloads()
    })

@app.route('/api/stream/<file_id>')
def stream_video(file_id):
    video_path = MEDIA_DB.get(file_id)
    if not video_path or not os.path.exists(video_path):
        return "Video not found", 404
    return send_file(video_path, conditional=True, mimetype='video/mp4')

def run_server(port):
    app.run(host='127.0.0.1', port=port, debug=False)
