const express = require('express');
const tmi = require('tmi.js');
const app = express();
const PORT = process.env.PORT || 8080;
const axios = require('axios');
var { google } = require('googleapis');
const bodyParser = require('body-parser');
require('dotenv').config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

let canSendMessage = true;
let ytSearchesLeft = 100;
/* "Projects that enable the YouTube Data API have a default quota allocation of 10,000 units per day"
  "A search request costs 100 units."
  https://developers.google.com/youtube/v3/getting-started#quota */

let emote = 'Vibe';
let emojis = [
  'peepoDJ',
  'xddJAM',
  'Dance',
  'danse',
  'Jigglin',
  'duckass',
  'yoshiJAM',
  'danseparty',
  'FloppaJAM',
  'catRAVE',
  'xar2EDM',
  'KEKVibe',
  'Jamgie',
  'Vibe',
];

function randomEmoji() {
  return emojis?.[Math.floor(Math.random() * emojis?.length + 1)];
}

let currentSong = {
  title: null,
  artist: null,
  youtubeId: null,
};

const getYoutubeId = (target, displayName, searchQuery) => {
  emote = randomEmoji();
  ytSearchesLeft = ytSearchesLeft - 1;
  console.log(
    `Searching Youtube for "${searchQuery}". We have ${ytSearchesLeft} searches left today.`
  );

  var service = google.youtube('v3');
  service.search
    .list({
      part: 'snippet',
      q: searchQuery,
      maxResults: 1,
      regionCode: 'DE',
      type: 'video',
      key: process.env.YOUTUBE_API_TOKEN,
    })
    .then((res) => {
      if (res?.data?.items?.length > 0) {
        let videoId = res?.data?.items?.[0]?.id?.videoId;
        console.log(
          `A relevant Youtube video with an ID ${videoId} was found.`
        );
        currentSong.youtubeId = videoId;
        client.say(
          target,
          `@${displayName} ${emote} Now playing: "${currentSong.title}" by "${currentSong.artist}" - https://youtu.be/${currentSong.youtubeId} ${emote}`
        );
      } else {
        console.log(
          'Youtube seach returned nothing. We will not provide a Youtube link to the user.'
        );
        currentSong.youtubeId = 'notfound';
        client.say(
          target,
          `@${displayName} ${emote} Now playing: "${currentSong.title}" by "${currentSong.artist}" ${emote}`
        );
      }
    })
    .catch((err) => {
      console.log(err);
      console.log(
        'Youtube seach returned an error. We will not provide a Youtube link to the user.'
      );
      currentSong.youtubeId = 'notfound';
      client.say(
        target,
        `@${displayName} ${emote} Now playing: "${currentSong.title}" by "${currentSong.artist}" ${emote}`
      );
    });
};

app.listen(PORT, function () {
  console.log(`App listening on port ${PORT}!`);
});

// we've specifiend /music to be the path for audd.io callbacks
app.post('/music', function (req) {
  console.log('Received a callback: ', JSON.stringify(req?.body));
  if (req?.body?.status === 'success') {
    // callback with sond recognised
    if (req?.body?.result?.results?.length > 0) {
      let songInfo = req?.body?.result?.results?.[0];
      currentSong.title = songInfo?.title;
      currentSong.artist = songInfo?.artist;
      currentSong.youtubeId = 'notsearched';
      console.log(
        `Callback received: Now playing "${songInfo?.title}" by "${songInfo?.artist}"`
      );
    }
  } else if (req?.body?.status === '-') {
    // notification received https://docs.audd.io/streams/#4-receive-the-results
    if (req?.body?.notification?.notification_code === 0) {
      // all good
      console.log(
        'Notification receieved with code 0 (all good): ',
        JSON.stringify(req?.body)
      );
    } else if (req?.body?.notification?.notification_code === 650) {
      // can't connect to the stream - I noticed some false-positives with that code and deleting and adding the stream url back resolves the issue.
      console.log(
        'Notification receieved with code 650 (cant connect to the stream): ',
        JSON.stringify(req?.body)
      );
      // reset in case the stream hasn't ended and audd.io just lost connection for some reason
      resetStream(null, null, false);
    } else if (req?.body?.notification?.notification_code === 651) {
      // no music/white noise
      console.log(
        'Notification receieved with code 0 (we dont receive any music from the stream, only white noise): ',
        JSON.stringify(req?.body)
      );
    }
  }
});

axios({
  method: 'post',
  url: 'https://api.audd.io/getCallbackUrl/',
  data: {
    api_token: process.env.AUDD_API_TOKEN,
  },
  headers: { 'Content-Type': 'multipart/form-data' },
})
  .then((response) => {
    console.log('Got a response from getCallbackUrl');
    if (
      response?.data?.status === 'success' ||
      response?.data?.result === process.env.CALLBACK_URL
    ) {
      console.log(
        `Callback url is set to ${response?.data?.result} - no need to change`
      );
    } else {
      // we need to set the callback url
      console.log('Callback url not set. We will set it now.');
      axios({
        method: 'post',
        url: 'https://api.audd.io/setCallbackUrl/',
        data: {
          api_token: process.env.AUDD_API_TOKEN,
          url: process.env.CALLBACK_URL,
        },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
        .then((response) => {
          console.log('Got a response from setCallbackUrl:');
          console.log(response?.data);
        })
        .catch((error) => {
          'Got an error from setCallbackUrl:}';
          console.log(error);
        });
    }
  })
  .catch((error) => {
    console.log('Got an error from getCallbackUrl:');
    console.log(error);
  });

// check if we have a stream added
axios({
  method: 'post',
  url: 'https://api.audd.io/getStreams/',
  data: {
    api_token: process.env.AUDD_API_TOKEN,
  },
  headers: { 'Content-Type': 'multipart/form-data' },
})
  .then((response) => {
    console.log('Got a response from getStreams: ');
    console.log(response?.data);
    if (response?.data?.result?.length !== 1) {
      // we don't have the stream added, add it
      console.log('We dont have a stream added. We will add it now.');
      axios({
        method: 'post',
        url: 'https://api.audd.io/addStream/',
        data: {
          api_token: process.env.AUDD_API_TOKEN,
          radio_id: 1,
          url: process.env.AUDD_STREAM_URL,
          callbacks: 'before',
        },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
        .then((response) => {
          console.log('Got the response from addStream:');
          console.log(response?.data);
        })
        .catch((error) => {
          console.log('Got an errror from addStream:');
          console.log(error);
        });
    } else {
      console.log('we have a stream added: ', response?.data?.result?.[0]?.url);
    }
  })
  .catch((error) => {
    console.log('Got an error from getStreams:');
    console.log(error);
  });

const resetStream = (target, displayName, withMessage) => {
  console.log(
    `${displayName} asked for a bot reset. We will remove and add the stream back.`
  );

  axios({
    method: 'post',
    url: 'https://api.audd.io/deleteStream/',
    data: {
      api_token: process.env.AUDD_API_TOKEN,
      radio_id: 1,
    },
    headers: { 'Content-Type': 'multipart/form-data' },
  })
    .then((response) => {
      console.log(
        'Got a response from deleteStream inside the reset function: '
      );
      console.log(response?.data);
      if (response?.data?.status === 'success') {
        console.log('Delete was successful - We will now re-add the stream.');
        axios({
          method: 'post',
          url: 'https://api.audd.io/addStream/',
          data: {
            api_token: process.env.AUDD_API_TOKEN,
            radio_id: 1,
            url: process.env.AUDD_STREAM_URL,
            callbacks: 'before',
          },
          headers: { 'Content-Type': 'multipart/form-data' },
        })
          .then((response) => {
            console.log(
              'Got the response from add stream in the reset function:'
            );
            console.log(response?.data);
            if (response?.data?.status === 'success' && withMessage) {
              client.say(target, `@${displayName} ok`);
            }
          })
          .catch((error) => {
            console.log('Got an errror from addStream:');
            console.log(error);
          });
      }
    })
    .catch((error) => {
      console.log('Got an error from deleteStream in the reset function: ');
      console.log(error);
    });
};
// configuration
const opts = {
  identity: {
    username: process.env.TWITCH_USERNAME,
    password: process.env.TWITCH_PASSWORD,
  },
  channels: [process.env.TWITCH_CHANNEL],
};

// create a client and pass our configuration
const client = new tmi.client(opts);

// event handlers
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// connect
client.connect();

// function that gets called on every inbound chat message
function onMessageHandler(target, context, msg, self) {
  let displayName = context['display-name'];

  // trim the message
  const commandName = msg.trim();

  // check if the message is one of our commands
  if (commandName === '!song' && canSendMessage) {
    emote = randomEmoji();

    // the sleep switch
    canSendMessage = false;

    if (currentSong.artist === null) {
      // tell the user there is no song playing
      client.say(
        target,
        `@${displayName} There's either no music playing right now or we weren't able to find a match yet.`
      );
    } else {
      if (currentSong.youtubeId === 'notfound' || ytSearchesLeft === 0) {
        // we already attempted to find ytid or we have fullfilled our daily gapi quote
        client.say(
          target,
          `@${displayName} ${emote} Now playing: "${currentSong.title}" by "${currentSong.artist}" ${emote}`
        );
      } else if (currentSong.youtubeId === 'notsearched') {
        // there is a song playing but we don't have a youtubeid
        getYoutubeId(
          target,
          displayName,
          `${currentSong.artist} ${currentSong.title}`
        );
      } else {
        // there is a song playing and we have ytid
        console.log('we have all the data');
        client.say(
          target,
          `@${displayName} ${emote} Now playing: "${currentSong.title}" by "${currentSong.artist}" - https://youtu.be/${currentSong.youtubeId} ${emote}`
        );
      }
    }

    // sleep so chatters don't spam the command
    setTimeout(() => {
      canSendMessage = true;
    }, 10000);
  }

  // reset command that can only be triggered by the user or a mod of the channel
  if (
    commandName === '!resetsongbot' &&
    (context?.username === process.env.TWITCH_USERNAME || context?.mod === true)
  ) {
    resetStream(target, displayName, true);
  }
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, port) {
  console.log(`* Music bot connected to twitch chat ${addr}:${port}`);
}
