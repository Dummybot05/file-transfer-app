const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const BASE_DIR = path.resolve(__dirname, '../external_uploads');
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

const getSafePath = (reqPath) => {
    const targetPath = path.resolve(BASE_DIR, reqPath || '');
    if (!targetPath.startsWith(BASE_DIR)) throw new Error('Unauthorized path access');
    return targetPath;
};

// Multer configured to create sub-directories dynamically for folder uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try { 
            const targetDir = getSafePath(req.query.path || '');
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            cb(null, targetDir); 
        } 
        catch (err) { cb(err); }
    },
    filename: (req, file, cb) => { cb(null, file.originalname); }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 1024 * 1024 * 1024 } 
});

app.get('/api/files', (req, res) => {
    try {
        const currentPath = req.query.path || '';
        const targetDir = getSafePath(currentPath);
        if (!fs.existsSync(targetDir)) return res.status(404).json({ error: 'Directory not found' });

        const items = fs.readdirSync(targetDir, { withFileTypes: true });
        const files = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            isZip: item.name.endsWith('.zip')
        }));
        res.json({ files, currentPath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/create-folder', (req, res) => {
    try {
        const { currentPath, folderName } = req.body;
        if (!folderName) return res.status(400).json({ error: 'Folder name required' });
        const targetDir = getSafePath(path.join(currentPath || '', folderName));
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir);
            res.json({ success: true, message: 'Folder created' });
        } else res.status(400).json({ error: 'Folder already exists' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ success: true });
});

app.post('/api/unzip', (req, res) => {
    try {
        const { currentPath, fileName } = req.body;
        if (!fileName) return res.status(400).json({ error: 'Filename is required' });

        const fullFilePath = getSafePath(path.join(currentPath || '', fileName));
        if (!fs.existsSync(fullFilePath)) return res.status(404).json({ error: 'Zip file not found' });

        const zip = new AdmZip(fullFilePath);
        const extractFolderName = fileName.replace('.zip', '');
        const extractPath = getSafePath(path.join(currentPath || '', extractFolderName));
        
        zip.extractAllTo(extractPath, true);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RENAME OPERATION ---
app.post('/api/rename', (req, res) => {
    try {
        const { currentPath, oldName, newName } = req.body;
        if (!oldName || !newName) return res.status(400).json({ error: 'Both old and new names are required' });

        const oldPath = getSafePath(path.join(currentPath || '', oldName));
        const newPath = getSafePath(path.join(currentPath || '', newName));

        if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Item not found' });
        if (fs.existsSync(newPath)) return res.status(400).json({ error: 'An item with that name already exists' });

        fs.renameSync(oldPath, newPath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- BULK OPERATIONS ---
app.post('/api/bulk-delete', (req, res) => {
    try {
        const { currentPath, items } = req.body;
        if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Items required' });

        items.forEach(item => {
            const targetPath = getSafePath(path.join(currentPath || '', item));
            if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true });
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/bulk-move', (req, res) => {
    try {
        const { currentPath, items, targetFolderPath } = req.body;
        const destinationDir = getSafePath(targetFolderPath || '');

        items.forEach(item => {
            const sourcePath = getSafePath(path.join(currentPath || '', item));
            const destinationPath = path.join(destinationDir, item);
            if (destinationDir.startsWith(sourcePath)) throw new Error(`Cannot move ${item} into itself.`);
            if (fs.existsSync(sourcePath)) fs.renameSync(sourcePath, destinationPath);
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/bulk-copy', (req, res) => {
    try {
        const { currentPath, items, targetFolderPath } = req.body;
        const destinationDir = getSafePath(targetFolderPath || '');

        items.forEach(item => {
            const sourcePath = getSafePath(path.join(currentPath || '', item));
            const destinationPath = path.join(destinationDir, item);
            if (fs.existsSync(sourcePath)) fs.cpSync(sourcePath, destinationPath, { recursive: true });
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Files saving to: ${BASE_DIR}`);
});