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

function sanitizeFileName(name) {
  if (typeof name !== 'string') {
    return ''; // Si le nom est undefined ou non une chaîne, retourner une chaîne vide
  }
  return name.replace(/[<>:"\/\\|?*]/g, '_'); // Remplace les caractères invalides par '_'
}

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
  if (req.body.searchType == "song") {
    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        q: searchQuery,
        type: 'track',
        limit: 10
      }
    });

    const tracks = response.data.tracks.items;
    const type = "track";
    res.render('results', { tracks, searchQuery, type });

  } else if (req.body.searchType == "album") {
    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        q: searchQuery,
        type: 'album',
        limit: 10
      },
    });

    const tracks = response.data.albums.items;
    const type = "album";
    res.render('results', { tracks, searchQuery, type });
  } else if (req.body.searchType == "playlist") {
    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        q: searchQuery,
        type: 'playlist',
        limit: 10
      },
  });
  const tracks = response.data.playlists.items.filter(p => p && p.name);
  const type = "playlist";
  res.render('results', { tracks, searchQuery, type });
  }
});

// Lancer le serveur
app.listen(3000, () => {
  console.log('Server launched on http://localhost:3000');
});

// Fonction de téléchargement
function downloadYoutubeMp3(url, outputPath, fileName = null) {
  const stream = ytdl(url, { filter: 'audioonly' });

  const filePath = fileName
    ? path.join(outputPath, `${fileName}.mp3`)
    : path.join(outputPath, `${Date.now()}.mp3`);

  stream.pipe(fs.createWriteStream(filePath));

  stream.on('end', () => {
    console.log(`✅ Downloaded and saved to: ${filePath}`);
  });

  stream.on('error', (err) => {
    console.error(`❌ Erreur lors du téléchargement du fichier :`, err);
  });
}

// Recherche YouTube
async function searchYoutube(query) {
  const result = await ytSearch(query);
  if (result.videos.length > 0) {
    return result.videos[0].url;
  } else {
    return null;
  }
}

// Convertir URL en embed URL
function convertToEmbedURL(youtubeURL) {
  const url = new URL(youtubeURL);
  const videoId = url.searchParams.get('v');
  return `https://www.youtube.com/embed/${videoId}`;
}

// Téléchargement
app.get('/download', async (req, res) => {
  const name = req.query.name;
  const type = req.query.type;
  console.log(req.query);
  console.log("Type : ", type);

  if (type == "track") {
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
  } else if (type == "album") {
    console.log("Album : ", name);
    console.log("ID : ", req.query.id);

    const sanitizedAlbumName = sanitizeFileName(name);
    const albumFolderPath = path.join('./downloads', sanitizedAlbumName);
    if (!fs.existsSync(albumFolderPath)) {
      fs.mkdirSync(albumFolderPath, { recursive: true });
    }

    const tracks = await getAlbumTracks(req.query.id);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const trackNumber = String(i + 1).padStart(2, '0');
      const sanitizedTrackName = sanitizeFileName(`${trackNumber} - ${track.name}`);

      console.log(sanitizedTrackName);

      searchYoutube(track.name).then(url => {
        if (url) {
          console.log('Lien YouTube trouvé :', url);
          downloadYoutubeMp3(url, albumFolderPath, sanitizedTrackName);
        } else {
          console.log('Aucun résultat trouvé.');
        }
      });
    }

    const url = "";
    const embedURL = "";
    res.render('download', { name, url, embedURL });
    console.log("Téléchargement de l'album terminé.");
  } else if (type == "playlist") {
    console.log("Playlist : ", name);
    console.log("ID : ", req.query.id);

    const sanitizedPlaylistName = sanitizeFileName(name);
    console.log("Nom de la playlist : ", sanitizedPlaylistName);
    let playlistFolderPath = path.join('./downloads', "playlist");


    if (!fs.existsSync(playlistFolderPath)) {
      fs.mkdirSync(playlistFolderPath, { recursive: true });
    }

    // Récupérer les morceaux de la playlist
    const response = await axios.get(`https://api.spotify.com/v1/playlists/${req.query.id}/tracks`, {
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`
      },
      params: {
        limit: 100
      }
    });

    const tracks = response.data.items
      .map(item => item.track)
      .filter(track => track !== null && track.name && track.artists && track.artists.length > 0);

    // Téléchargement des morceaux un par un
    for (let i = 0; i < tracks.length; i++) {  
      const track = tracks[i];
      const trackName = `${track.name} - ${track.artists[0].name}`;
      const sanitizedTrackName = sanitizeFileName(trackName);

      console.log(sanitizedTrackName);

      // Recherche du lien YouTube
      searchYoutube(trackName).then(url => {
        if (url) {
          console.log('Lien YouTube trouvé :', url);
          // Téléchargement du fichier MP3 depuis YouTube
          downloadYoutubeMp3(url, playlistFolderPath, sanitizedTrackName);
        } else {
          console.log('Aucun résultat trouvé pour', trackName);
        }
      });
    }

    const url = "";
    const embedURL = "";
    res.render('download', { name, url, embedURL });
    console.log("Téléchargement de la playlist terminé.");
}


});

// Récupérer les musiques de l'album
async function getAlbumTracks(albumId) {
  const token = await getAccessToken();
  const response = await axios.get(`https://api.spotify.com/v1/albums/${albumId}/tracks`, {
    headers: {
      "Authorization": `Bearer ${token}`
    },
    params: {
      limit: 50
    }
  });
  return response.data.items;
}
