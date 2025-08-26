const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.json({ message: 'Simple server working' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Simple server running on port ${PORT}`);
});