require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const ytSearch = require('yt-search');

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

// Fonction pour obtenir le token Spotify
async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const authBuffer = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post('https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        'Authorization': `Basic ${authBuffer}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    }
  );

  return response.data.access_token;
}

// Page d'accueil avec le formulaire de recherche
app.get('/', (req, res) => {
  res.render('index');
});

// Quand on envoie une recherche
app.post('/search', async (req, res) => {
  const searchQuery = req.body.query;
  const token = await getAccessToken();

  const response = await axios.get('https://api.spotify.com/v1/search', {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    params: {
      q: searchQuery,
      type: 'track', // Recherche de morceaux
      limit: 10
    }
  });

  const tracks = response.data.tracks.items;
  res.render('results', { tracks, searchQuery });
});

// Lancer le serveur
app.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});


function downloadYoutubeMp3(url, outputFolder = './downloads') {
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  ytdl.getInfo(url).then(info => {
    const title = info.videoDetails.title.replace(/[<>:"\/\\|?*]+/g, ''); // Nettoyer le titre pour en faire un nom de fichier valide
    const outputPath = path.join(outputFolder, `${title}.mp3`);
    
    const stream = ytdl(url, { quality: 'highestaudio' });

    ffmpeg(stream)
      .audioBitrate(128)
      .save(outputPath)
      .on('end', () => {
        console.log(`✅ Downloaded and saved to: ${outputPath}`);
      })
      .on('error', err => {
        console.error('❌ Error:', err);
      });
  }).catch(err => {
    console.error('❌ Failed to get video info:', err);
  });
}

async function searchYoutube(query) {
  const result = await ytSearch(query);
  if (result.videos.length > 0) {
    return result.videos[0].url; // Premier résultat
  } else {
    return null;
  }
}

function convertToEmbedURL(youtubeURL) {
  const url = new URL(youtubeURL);
  const videoId = url.searchParams.get('v');
  return `https://www.youtube.com/embed/${videoId}`;
}

app.get('/download', (req, res) => {
  const name = req.query.name;
  console.log(name);
  searchYoutube(name).then(url => {
    if (url) {
      console.log('Lien YouTube trouvé :', url);
      downloadYoutubeMp3(url, './downloads');
      const embedURL = convertToEmbedURL(url);
      res.render('download', { name, url, embedURL });
    } else {
      console.log('Aucun résultat trouvé.');
    }
  });
});



