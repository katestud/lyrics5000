var http = require('http');

var Alexa = require('alexa-sdk');

var suggestionPhrases = [
  "Are you interested in lyrics for ",
  "What do you think about "
]

var apiKey = process.env.MUSIX_MATCH_API_KEY;

var getFullLyrics = function(trackId) {
  return new Promise((resolve, reject) => {

    var lyricsSearchUrl = 'http://api.musixmatch.com/ws/1.1/track.lyrics.get?apikey=' + apiKey;
    var queryString = '&track_id=' + trackId;

    var request = http.get(lyricsSearchUrl + queryString, (res) => {
        var lyricsResponse = '';
        console.log('Status Code: ' + res.statusCode);

        res.on('data', (data) => {
          lyricsResponse += data;
        });

        res.on('end', (end) => {
          var lyricsResponseObject = JSON.parse(lyricsResponse);

          var lyrics = lyricsResponseObject.message.body.lyrics.lyrics_body;
          var cleanedUpLyrics = lyrics.split(/\*\*\*\*\*\*/)[0]

          resolve(cleanedUpLyrics);
        });
      request.on('error', (err) => reject(err));

    })
  })

};

var parseTrackList = function(response) {
  var trackResponseObject = JSON.parse(response);
  return trackResponseObject.message.body.track_list;
};


exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.registerHandlers(intentHandlers);
    alexa.execute();
};

var intentHandlers = {

    "SearchTopicIntent": function () {
      var intent = this.event.request.intent;
      var lyricSlot = intent.slots.Lyric;
      var speechOutput = '';

      if (lyricSlot && lyricSlot.value) {
        var topicName = lyricSlot.value;

        var searchUrl = 'http://api.musixmatch.com/ws/1.1/track.search?s_track_rating=desc&apikey=' + apiKey;
        var queryString = '&q_lyrics=' + topicName;

        http.get(searchUrl + queryString, (res) => {
            var trackResponse = '';
            console.log('Status Code: ' + res.statusCode);

            if (res.statusCode != 200) {
              this.emit('NoSongsFound');
            }

            res.on('data', (data) => {
              trackResponse += data;
            });

            res.on('end', (end) => {
              var tracks = parseTrackList(trackResponse);

              if (tracks.length == 0) {
                this.emit('NoSongsFound');
              }

              this.attributes.tracks = tracks;

              this.emit('SuggestTrackEvent');
            });

        }).on('error', function () {
          this.emit(':tell', 'Sorry, something went wrong!');
        });
      }
    else {
        var noSlotMessage = 'Sorry, you need to provide a lyric or topic.'
        this.emit(':tell', noSlotMessage);
      }
    },

    "SuggestTrackEvent": function() {
      var suggestionPhrase = suggestionPhrases[Math.floor(Math.random() * suggestionPhrases.length)];
      var tracks = this.attributes.tracks;
      var track = tracks.pop();
      this.attributes.track = track;
      this.attributes.tracks = tracks;

      var speechOutput = suggestionPhrase + track.track.track_name + ' by ' + track.track.artist_name + '?';
      this.emit(':ask', speechOutput, speechOutput);
    },

    "GetDifferentTrackIntent": function() {
      if (this.attributes.tracks.length == 0) {
        this.emit(':tell', 'Sorry, that\'s all the tracks I have.');
        return
      }
      this.emit('SuggestTrackEvent');
    },

    "GetLyricsIntent": function() {
      var intent = this.event.request.intent;
      var artistSlot = intent.slots.Artist;
      var songSlot = intent.slots.Song;
      var speechOutput = '';

      if (artistSlot && artistSlot.value && songSlot && songSlot.value) {
        var artistName = artistSlot.value;
        var songName = songSlot.value;

        var searchUrl = 'http://api.musixmatch.com/ws/1.1/track.search?s_track_rating=desc&apikey=' + apiKey;
        var queryString = '&q_track=' + songName + '&q_artist=' + artistName;

        http.get(searchUrl + queryString, (res) => {
            var songResponse = '';
            console.log('Status Code: ' + res.statusCode);

            if (res.statusCode != 200) {
              this.emit('NoSongsFound');
            }

            res.on('data', (data) => {
              songResponse += data;
            });

            res.on('end', (end) => {
              var tracks = parseTrackList(songResponse);

              if (tracks.length == 0) {
                this.emit('NoSongsFound');
                return;
              }

              var track = tracks[0];
              this.attributes.track = track;
              var trackId = track.track.track_id;

              getFullLyrics(trackId).
              then((response) => {
                this.attributes.lyrics = response;
                this.emit("ReadLyrics");
              });

            });
        }).on('error', function () {
          this.emit(':tell', 'Sorry, something went wrong!');
        });
      }
    else if (this.attributes.track && this.attributes.track.track) {
      var trackId = this.attributes.track.track.track_id

        getFullLyrics(trackId).
        then((response) => {
          this.attributes.lyrics = response;
          this.emit("ReadLyrics");
        });
      }
    else {
        var noSlotMessage = 'Sorry, you need to provide an artist and a song name.'
        this.emit(':tell', noSlotMessage);
      }
    },

    "ReadLyrics": function() {
      var track = this.attributes.track
      var lyrics = this.attributes.lyrics;

      var speechOutput = 'The full lyrics for ' + track.track.track_name + ' by ' + track.track.artist_name + ' are ' + lyrics;
      this.emit(':tell', speechOutput);
    },

    "NoSongsFound": function() {
      this.emit(':ask', "Sorry, I couldn't find a song for that request. Try again.", "Ask for a topic or song name and artist");
    },

    "CloseAppIntent": function() {
      this.emit('AMAZON.StopIntent');
    },

    "LaunchRequest": function() {
      this.emit(':ask', 'Say a song and artist to get lyrics, or name a topic.', 'Say a topic or song and artist.');
    },

    "AMAZON.HelpIntent": function () {
        this.emit(':ask', 'Either tell me a topic or a song to get info', 'Say a topic or a song name and artist');
    },

    "AMAZON.StopIntent": function () {
        this.emit(':tell', 'Thanks for using lyric searcher. Bye!');
    },

    "AMAZON.CancelIntent": function () {
        this.emit(':tell', 'Bye!');
    }
};
