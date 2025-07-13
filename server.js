const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'urls.json');

// Middleware pour parser les requêtes JSON
app.use(express.json());

// Middleware pour servir les fichiers statiques
app.use(express.static('public'));

// Vérifie si le fichier JSON existe, sinon le crée avec un objet vide
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf8');
}

function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Erreur lors de la lecture du fichier JSON:", error);
    return {};
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error("Erreur lors de l'écriture du fichier JSON:", error);
  }
}

function generateId(length = 6) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function normalizeUrl(url) {
  // Supprime le "/" à la fin si présent
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  // Ajoute "https://" si l'URL ne commence pas déjà par un protocole
  if (!url.match(/^[a-zA-Z]+:\/\//)) {
    url = 'https://' + url;
  }
  return url;
}

// Fonction pour envoyer "refresh" sur le terminal du serveur Glitch après 2 minutes
function sendRefresh() {
  exec('refresh', (error, stdout, stderr) => {
    if (error) {
      console.error(`Erreur lors de l'envoi de la commande: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Erreur de sortie de la commande: ${stderr}`);
      return;
    }
    console.log(`Sortie de la commande: ${stdout}`);
  });
}

// Planifier l'envoi de "refresh" après 2 minutes (120000ms)
setTimeout(sendRefresh, 120000);

app.post('/shorten', async (req, res) => {
  let { url, password } = req.body;
  url = normalizeUrl(url);

  try {
    // Vérifie l'accessibilité de l'URL
    await axios.head(url);
    const data = readData();

    let matchingEntry = null;
    let matchingEntryWithoutPassword = null;

    Object.entries(data).forEach(([key, value]) => {
      if (normalizeUrl(value.url) === url) {
        if (value.password) {
          if (value.password === password) {
            matchingEntry = key;
          }
        } else {
          matchingEntryWithoutPassword = key;
        }
      }
    });

    if (matchingEntry) {
      res.send({ shortUrl: `https://${req.headers.host}/${matchingEntry}` });
    } else if (!password && matchingEntryWithoutPassword) {
      res.send({ shortUrl: `https://${req.headers.host}/${matchingEntryWithoutPassword}` });
    } else {
      let id;
      do {
        id = generateId();
      } while (data.hasOwnProperty(id));

      data[id] = { url, password: password || null };
      writeData(data);

      res.send({ shortUrl: `https://${req.headers.host}/${id}` });
    }
  } catch (error) {
    res.status(400).send('URL invalide.');
  }
});

app.get('/:id', (req, res) => {
  const { id } = req.params;
  const data = readData();
  const entry = data[id];

  if (entry) {
    if (entry.password) {
      res.redirect(`/prompt/${id}`);
    } else {
      res.redirect(entry.url);
    }
  } else {
    res.status(404).send('URL non trouvée');
  }
});

app.get('/prompt/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'passwordPrompt.html'));
});

app.post('/verify/:id', (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  const data = readData();
  const entry = data[id];

  // Vérification si l'entrée existe et si un mot de passe est défini
  if (!entry) {
    return res.status(404).send('URL non trouvée');
  }

  if (!entry.password) {
    return res.status(400).send('Cette URL ne nécessite pas de mot de passe');
  }

  if (password && password === entry.password) {
    res.json({ url: entry.url });
  } else {
    res.status(401).send('Mot de passe incorrect');
  }
});

app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
