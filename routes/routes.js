const { uploadFile, getNewsDist } = require('../models/database.js');
var db = require('../models/database.js');
var news = require('../../News/newsParser.js');
var AWS = require('aws-sdk');
var fs = require('fs');
var bcrypt = require('bcrypt');
var s3 = new AWS.S3();
const request = require('request');
const cheerio = require('cheerio');
const multer = require('multer')
//tracks if the livy process is currently running to ensure two jobs aren't sent at once
var running = false;

var get_chat = function(req, res) {
  db.updateOnline(req.session.username);
  res.render('chat.ejs', {user: req.session.username});
}

var get_fullname = function(req, res) {
  var username = req.body.username;
  db.profileLookup(username, function(err, data) {
    if (err) {
      console.log(err);
      res.send(JSON.stringify({error: "fullname query error"}));
    } else {
      console.log("success");
      res.send(JSON.stringify(data.name));
    }
  });
}
// get the home page
var get_home = function(req, res) {
  if (req.session.username) {
    db.updateOnline(req.session.username);
    db.profileLookup(req.session.username, function(err, data) {
      if (err) {
        console.log(err);
        res.render('main.ejs', {requests: null, curr: String(req.session.username)});
      } else {
        indexNews(req, res);
        req.session.name = data.name;
        res.render('main.ejs', {requests: data.received_requests, friends: data.friends,
            curr: String(req.session.username), namefull: data.name});
      }
    });
  }
  else {
    res.render('login.ejs', {error: req.query.error});
  }
}

// displays posts on the home page
var show_posts = function(req, res) {
    if (req.session.username) {
        var username = req.session.username;
        db.posts(username, function(err, data) {
            if (err) {
                console.log(err);
                res.send(JSON.stringify({error: "ERROR: Internal Server Error"}));
            } else {
                res.send(JSON.stringify(data));
            }
        })
    }
}
//adds profile picture updates as post
var add_profile_post = function(req, res) {
  db.updateOnline(req.session.username);
  var dateObj = new Date();
  var result = Math.floor(dateObj.getTime() / 1000.0);
  var date2 = dateObj.toISOString();
  var name = req.session.username;
  var url = req.body.url;

  var info = {
    'wall_id': name,
    'post_id': result.toString(),
    'content': url,
    'date': date2,
    'creator': name,
    'parent': name,
    'receiver': name,
    'likes': 0,
    'like_list': []
  }

  db.picturePost(info, function(err, data) {
    if (err) {
      console.log(err);
      console.log('error at profile pic post');
    }
    else {
      db.updateOnline(req.session.username);
      console.log('added picture succesfully');
      res.send({success: true});
    }
  })
}

// adds/deletes/likes/comments on the post
var add_post = function(req, res) {
    db.updateOnline(req.session.username);
    var msgParam = req.query.msg;
    console.log(msgParam);
    if (msgParam == 2) {
        db.deletePost(req, function(err, data) {
            if (err) {
                console.log(err);
                res.send(JSON.stringify({error: "ERROR: Internal Server Error"}));
            } else {
                res.send(JSON.stringify(data));
            }
        })
    } else if (msgParam == 3) {
        db.updateLikes(req, function(err, data) {
            if (err) {
                console.log(err);
                res.send(JSON.stringify({error: "ERROR: Internal Server Error"}));
            } else {
                res.send(JSON.stringify(data));
            }
        })
    } else {
        db.addPost(req, function(err, data) {
            if (err) {
                console.log(err);
                res.send(JSON.stringify({error: "ERROR: Internal Server Error"}));
            } else {
                res.send(JSON.stringify(data));
            }
        })
    }
}
//get current user
var get_current_login = function(req, res) {
  var username = req.session.username;
  res.send({currentUser : username});
}

//get chat people name for chatting
var get_chatting_people = function(req, res) {
  var username = req.session.username;

}

var get_registration = function(req, res) {
    res.render('registration.ejs', {error: req.query.error});
}

var get_wall = function(req, res) {
    if (!req.session.username) {
      res.redirect("/");
    }
    console.log(JSON.stringify(req.params));
    db.updateOnline(req.session.username);
    var wallID = req.params.name;
    console.log("WALLID: " + req.protocol);
    db.profileLookup(wallID, function(err, data) {
      if (err) {
        console.log(err);
        res.render('wall.ejs', {info: null, user: req.session.username, wall: wallID});
      } else {
        console.log('this is data');
        console.log(data);
        res.render('wall.ejs', {info: data, user: req.session.username, wall: wallID, username: req.session.name});
      }
    });
}

var get_news = function(req, res) {
  db.updateOnline(req.session.username);
  res.render("news.ejs", {news: [], user: req.session.username});
}

var getNewsToday = function(req, res) {
  db.getNewsToday(function(err, data) {
    if (err) {
      res.send({sucess: false});
      console.log(err);
    }
    else {
      res.send({data: data});
    }
  })
}

//gets all current users
var getAllUsers = function(req, res) {
  db.allUsers(function(err, data) {
    if (err) {
      console.log('error at get alll users');
    }
    else {
      res.send(JSON.stringify({data: data.Items}));
    }
  })
}

var get_visualizer = function(req, res) {
  if (!req.session.username) {
    res.redirect("/");
  } else {
    res.render("friendvisualizer.ejs", {user: req.session.username});
  }
}

//checks the login information and reroutes user if valid login credentials
var login_check = function(req, res) {
    var info = req.body;

    //looks up data in the users table
    db.loginLookup(info.username, info.password, function(err, data) {
        //checks to see if query err otherwise checks to see if username, password match the given username
        if (err) {
          res.redirect('/?error=' + encodeURIComponent("ERROR: Internal Server Error"))
        } else if (data == 0) {
          res.redirect('/?error=' + encodeURIComponent("ERROR: Incorrect Password"))
        } else if (data == 1) {
          console.log('rendering');
          req.session.username = info.username;
          res.redirect('/');
          db.updateOnline(req.session.username);
        } else {
          res.redirect('/?error=' + encodeURIComponent("ERROR: Incorrect username or name"))
        }
    });
};

//uses the signup form information to create an account and send to the db
var create_account = function(req, res) {
    var info = req.body;
    console.log(info);
    //sets the join date to today's date
    info['joined'] = new Date().toLocaleDateString();
    info['url'] = 'https://icon-library.com/images/default-profile-icon/default-profile-icon-16.jpg';
    var name = info.fname + " " + info.lname;
    db.profileLookup(info.username, function(err, data) {
        if (err) {
          res.redirect('/register?error=' + encodeURIComponent("ERROR: Internal Server Error"))
        } else if (data) {
            //if relevant data is found (meaning username already in table) then can't produce another same account
            res.redirect('/register?error=' + encodeURIComponent("ERROR: Account Already Exists"))
          }
        else {
          //if pass checks to add to page, we attempt to add our data to the datatable and set session state once this is done
          db.profile(info, function(err, data) {
            if (err) {
              res.redirect('/register?error=' + encodeURIComponent("ERROR: Internal Server Error"))
            } else if (data) {
                req.session.username = info.username;
                res.redirect('/');
            }
          });
        }
    })

    for (var i = 0; i < name.length; i ++) {
        for (var j = i + 1; j < name.length + 1; j ++) {
            db.storePrefix(name.slice(i, j).toLowerCase(), info.username, name);
        }
    }
}

var friendPost = function(req, res) {
  var info = req.body;
  console.log(info);
  db.profileLookup(info.receiver, function(err, data) {
    if (err) {
      console.log('error in profile lookup');
    }
    else {
      info['receiver_name'] = data.name;
      db.profileLookup(info.sender, function(er, dat) {
        if (er) {
          console.log('error in profile lookup');
        }
        else {
          info['sender_name'] = dat.name
          db.friendPost(info, function(e, d) {
            if (err) {
              console.log('there is an error at friend post');
            }
            else {
              res.send({success: true});
            }
          })
        }
      })
    }
  })

}

//route that links with jquery to in place update public person data
var public_update = function(req, res) {
  var info = req.body;
  console.log(info);
  db.updateOnline(req.session.username);
  info['username'] = req.session.username;
  db.publicProfileUpdate(info, function(err, data) {
    if (err) {
      res.send(JSON.stringify({error: "ERROR: Internal Server Error"}));
    }
    else {
      db.updateFriendsAffiliation(req.session.username, info.affiliation, function(err) {
        if (err) {
          res.send({success: false});
        } else {
          res.send({success: true});
        }
      })
    }
  })
}

//route that links with jquery to in place update private personal data
var private_update = function(req, res) {
  var info = req.body;
  db.updateOnline(req.session.username);
  info['username'] = req.session.username;
  db.privateProfileUpdate(info, function(err, data) {
    if (err) {
      res.send(JSON.stringify({error: "ERROR: Internal Server Error"}));
    }
    else {
      console.log('updated private info');
      res.send({success: true});
    }
  })
}

var getArticle = function(req, res) {
  var multiple = req.body.keyword.split(" ");

  db.getNewsData(multiple, function(data) {
    res.send(JSON.stringify({data: data}));
  })
}

var articleImages = function(req, res) {
  var data = JSON.parse(req.body.info)
  console.log('the length is ' + data.length);
  Promise.all(data.map(function (item) {
    return new Promise((resolve, reject) => {
        var a = item;
        request(a['link'], (error,
                            response, html) => {
            if (!error && response.statusCode == 200) {
                const $ = cheerio.load(html);
                //each image is located in a meta tag
                a['image'] = $('meta[property="twitter:image"]').attr('content');

            }
            else {
                a['image'] = "";
            }
            resolve(a);
        });
    });
  })).then((result) => {
    console.log('sending image');
    res.send(JSON.stringify({data: result}));
  }).catch(function (err) {
    console.log(err);
  });
}

//in the beginning of the page load, we update the category articles for the current day
var indexNews = function(req, res) {
  db.indexNews(function(data) {
    const s3params = {
      Bucket: 'nets212g08',
      Key: 'articles/categoryArticles.txt',
      Body: fs.readFileSync("categoryArticles.txt")
    }

    s3.upload(s3params, function(error, d) {
      if (error) {
          throw error;
      }
      console.log('CategoryArticles Uploaded successfully');
    });
  });
}

//once a user updates their information, the info is updated and sent to the database
var indexUsers = function(req, res) {
  db.indexUsers(function(data) {
    const friendsparams = {
      Bucket: 'nets212g08',
      Key: 'articles/userFriends.txt',
      Body: fs.readFileSync("userFriends.txt")
    }

    s3.upload(friendsparams, function(error, d) {
      if (error) {
          throw error;
      }
      console.log('userFriends Uploaded successfully');
    });

    const catparams = {
      Bucket: 'nets212g08',
      Key: 'articles/userCategories.txt',
      Body: fs.readFileSync("userCategories.txt")
    }

    s3.upload(catparams, function(error, d) {
      if (error) {
          throw error;
      }
      console.log('userCategories Uploaded successfully');
    });

    const artparams = {
      Bucket: 'nets212g08',
      Key: 'articles/userArticles.txt',
      Body: fs.readFileSync("userArticles.txt")
    }

    s3.upload(artparams, function(error, d) {
      if (error) {
          throw error;
      }
      console.log('userArticles Uploaded successfully');
    });
  });
  res.send({success: true});
}

var getPic = function(req, res) {
  var username = req.session.username;
  db.profileLookup(username, function(err, data) {
    if (err) {
      console.log(err)
    }
    else {
      console.log('success');
      res.send({data: data.profileURL})
    }
  })
}

const storage = multer.memoryStorage({
  destination: function(req, file, callback) {
      callback(null, '');
  }
});

const upload = multer({storage: storage}).single('file');

var imagePost = function(req, res) {
  var img = req.file;
  var filename = img.originalname;
  var info = JSON.parse(req.query.content);
  db.updateOnline(req.session.username);
  const params = {
    Bucket: 'nets212g08',
    Key: `post/${req.session.username}/${filename}`,
    Body: img.buffer
  }

  s3.upload(params, function(err, data) {
    if (err) {
      console.log(err);
    }
    else {
      var finalURL = `https://nets212g08.s3.amazonaws.com/post/${req.session.username}/${filename}`;
      info['content'] = {'text': info['content'], 'url': finalURL};
      info['type'] = 'image';
      console.log(info);
      db.profileLookup(info['wall_id'], function(err, data) {
        if (err) {
          console.log(err);
          console.log('in imagePost');
        }
        else {
          info['name'] = data.name;
          db.imagePost(info, function(err, data) {

          });
        }
      })


    }
  });
  res.send({success: true});
}

//uploads the profile picture to the backend
var profilePic = function(req, res) {
  var img = req.file;
  var filename = img.originalname
  console.log(filename);
  db.updateOnline(req.session.username);
  const params = {
    Bucket: 'nets212g08',
    Key: `profiles/${req.session.username}/${filename}`,
    Body: img.buffer
  }

  s3.upload(params, function(err, data) {
    if (err) {
      console.log(err);
      console.log('error with profile picture');
    }
    else {
      var finalURL = `https://nets212g08.s3.amazonaws.com/profiles/${req.session.username}/${filename}`
      db.profilePic(req.session.username, finalURL, function(err, data) {
        if (err) {
          console.log(err);
        }
        else {
          console.log("Updating profile picture in DB");
          db.updateFriendsPic(req.session.username, finalURL, function(err) {
            if (err) {
            } else {
              console.log(err);
              res.send(JSON.stringify({data: finalURL}));
            }
          })
        }
      });
    }
  })
}

var profileLookup = function(req, res) {
  var wallID = req.params.id;
  console.log('this is the id');
  console.log(req.params.id);
  db.profileLookup(wallID, function(err, data) {
    if (err) {
      console.log('there is an error getting the data');
    }
    else {
      res.send(JSON.stringify({data: data}));
    }
  })
}

//own profile
var my_profile = function(req, res) {
  var own = req.session.username;
  db.profileLookup(own, function(err, data) {
    if (err) {
      console.log("error");
    } else {
      res.send({data: data});
    }
  })
}
var friendsLookup = function(req, res) {
  var user = req.session.username;
  db.profileLookup(user, function(err, data) {
    if (err) {
      console.log('there is an error getting the data');
    }
    else {
      res.send(JSON.stringify({data: data}));
    }
  })
}

/* gets the distribution / article to send to frontend */
var getDist = function() {
  //first scans for all possible users to feed a news article to
  db.allUsers(function(err, d) {
    d.Items.forEach( data => {
      if (data) {
        let interests = data.interests;
        let username = data.username;
        var name = data.name;
        db.getNewsDist(username, function(data) {
          var article = [];
          var weight = [];
          console.log("data from filtering");
          //pushes all articles and their respective weights into the array with matching indices
          if (data.length > 0) {
            data.forEach(item => {
              if (interests.includes(item.category)) {
                article.push(item.article);
                weight.push(parseFloat(item.weight));
              }
            });
            //first we will normalize the weights by summing them up and dividing each by their sum
            var sum = weight.reduce((accum, el) => accum + el, 0);
            var acc = 0;
            //next we will accumulate the weights in order to get a probability density function
            weight = weight.map(el => acc = acc + (el / sum));
            //now we choose a random number and wherever the number lies will be the respective index that we choose
            var random = Math.random() * weight[weight.length - 1];
            console.log("random is " + random);
            var art = article[weight.filter(el => el <= random).length];
            //get the news article, send it to the front page and then delete it from distribution and update it to seen
            if (art) {
              db.getNews(art, function(err, dat) {
                if (dat) {
                  var a = dat[0];
                  console.log(username);
                  console.log(a);
                  var promise = new Promise((resolve, reject) => {
                    a['description'] = a['description'].replace(/\\/g, '');
                    request(a['link'], (error, response, html) => {
                      if (!error && response.statusCode == 200) {
                          const $ = cheerio.load(html);
                          //each image is located in a meta tag
                          a['image'] = $('meta[property="twitter:image"]').attr('content');
                      }
                      else {
                          a['image'] = "";
                      }
                      console.log('loading');
                      resolve(a);
                    });
                  });
                  promise.then((result) => {
                    db.updateSeen(art, username, function(data) {
                      const params = {
                        Bucket: 'nets212g08',
                        Key: 'articles/seenArticles.txt',
                        Body: fs.readFileSync("seenArticles.txt")
                      }
                      s3.upload(params, function(error, d) {
                        if (error) {
                            throw error;
                        }
                        console.log('seenArticle Uploaded successfully');
                      });
                    });
                    if (Object.keys(dat[0]).length != 0) {

                      var post = {
                        'content': JSON.stringify(dat[0]),
                        'creator': username,
                        'receiver': username,
                        'date': dat[0].date,
                        'type': "news",
                        'post_id': `Article ${dat[0].id}`,
                        'parent' : username,
                        'wall_id' : username,
                        'likes': 0,
                        'creator_name': "",
                        'receiver_name': name,
                        'like_list': []
                      };

                      db.addNewsPost(post, function(err, data) {
                        if (data) {
                          console.log('updated article likes');
                        }
                      });
                    }
                  }).catch(function (err) {
                    console.log(err);
                  });
                }
                else {
                  console.log('no results or has been seen');
                }
              });
            }
        } else {
          console.log('no results');
          }
        });
      }
    });
  })
}

//tracks which articles have been liked and updates in database containing like post count
var articleLikes = function(req, res) {
  var id = req.body.id;
  var likes = req.body.count;
  var unlike = req.body.unlike;
  var postId = req.body.post_id;
  var wallId = req.body.wall_id;

  db.getOnePost(wallId, postId, function(err, data) {
    console.log(unlike);
    var l = data.like_list;
    if (unlike == 'true') {
      var index = l.indexOf(req.session.username);
      l.splice(index, 1);
      console.log('spliced data');
      console.log(l);
    }
    else {
      console.log(l);
      l.push(req.session.username);
    }
    likes = l.length;

    db.articleLikes(req.session.username, id, l, likes, function(err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log(data);
        console.log(data.like_list);
        db.indexArticles(function(data) {
          const params = {
            Bucket: 'nets212g08',
            Key: 'articles/userArticles.txt',
            Body: fs.readFileSync("userArticles.txt")
          }

          s3.upload(params, function(error, d) {
            if (error) {
                throw error;
            }
            console.log('userArticles Uploaded successfully');
          });
        });
        console.log('updated the like count for this article');
        res.send({sucess: true});
      }
    });


  })
}

//spawns the adsorption algorithm and then once it finishes, gets the distribution to send back to frontend
const spawnAdsorption = function() {
  console.log(running);
  if (!running) {
    running = true;
    console.log('running adsorption algorithm...');
    const { spawn } = require('child_process');
    const ls = spawn('java', ['-jar', 'Livy.jar']);

    ls.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    ls.on('exit', function() {
      console.log('done with adsorption algorithm');
      running = false;
      getDist();
    });
  }
  else {
    console.log('process is currently occuring');
  }
}

//runs the spawnAbsorption every 5 minutes
const timeLivy = function() {
  spawnAdsorption();
  console.log('in time livy');
  setTimeout(timeLivy, 300000);
}

//sends friend request
var send_request = function(req, res) {
  db.updateOnline(req.session.username);
  var sender = req.session.username;
  var receiver = req.body.receiver;

  db.addSentRequests(sender, receiver, function(err) {
    if (err) {
      console.log("failure");
      res.send(JSON.stringify({error: "ERROR: Already sent request"}));
    } else {
      db.addReceivedRequests(sender, receiver, function(err) {
        if (err) {
          console.log("failure 2");
          res.send(JSON.stringify({error: "ERROR: Already sent request"}));
        } else {
          console.log("success");
          res.send(JSON.stringify({success: "success"}));
        }
      });
    }
  });
}

//deletes friend requests after accept/denyRequest
var delete_request = function(req, res) {
  var receiver = req.session.username;
  var sender = req.body.sender;
  console.log(sender);

  db.deleteSentRequest(sender, receiver, function(err) {
    if (err) {
      console.log("failure");
      res.send(JSON.stringify({error: "ERROR: Already sent request"}));
    } else {
      db.deleteReceivedRequest(sender, receiver, function(err) {
        if (err) {
          console.log("failure 2");
          res.send(JSON.stringify({error: "ERROR: Already sent request"}));
        } else {
          console.log("success");
          res.send(JSON.stringify({success: "success"}));
        }
      });
    }
  });
}

//accepts friend request
var add_friend = function(req, res) {
  db.updateOnline(req.session.username);
  var receiver = req.session.username;
  var sender = req.body.sender;
  console.log(sender);
  //delete both requests and then add each other to friends lists
  db.addFriend(receiver, sender, function(err) {
    if (err) {
      console.log("failure");
      res.send(JSON.stringify({error: "ERROR: Already sent request"}));
    } else {
      db.addFriend(sender, receiver, function(err) {
        if (err) {
          console.log("failure");
        } else {
          console.log("success");
          res.send(JSON.stringify({success: "success"}));
        }
      })
    }
  });
}

var unfriend = function(req, res) {
  db.updateOnline(req.session.username);
  var sender = req.session.username;
  var receiver = req.body.receiver;
  console.log(receiver);
  //delete both requests and then add each other to friends lists
  db.unfriend(receiver, sender, function(err) {
    if (err) {
      console.log("failure");
      res.send(JSON.stringify({error: "ERROR: Already sent request"}));
    } else {
      db.unfriend(sender, receiver, function(err) {
        if (err) {
          console.log("failure");
        } else {
          console.log("success");
          res.send(JSON.stringify({success: "success"}));
        }
      })
    }
  });
}

//logs user out and destroys session data
var logout = function(req, res) {
  db.deleteOnline(req.session.username);
  req.session.destroy();
  res.redirect('/');
}
//chat
var chatJoin = function(req, res) {
  const room = req.body.room;
  res.send({success: true}, {currentSender: String(req.session.username)});
}

var chatLeave = function(req, res) {
  const room=req.body.room;
  res.send({success: true});
}

var joinRoom = function(req, res) {

}

var addChatMessages = function(req, res) {
  var first = req.session.username;
  //var second = req.body.otherperson;
  //const roomID = first + "-" + second + "-chat";
  const theMessage = req.body.newMessage;
  //console.log("suddenly everything after doesn't work");
  console.log(theMessage.chatroom);
  console.log(theMessage.sender);
  console.log(typeof theMessage.sender);
  console.log(theMessage.time);
  console.log(theMessage.msgtext);
  db.addmessage(theMessage.chatroom, theMessage.sender, theMessage.time, theMessage.msgtext, function(err, data) {
    if (err) {
      console.log("route adding fail")
      console.log(err);
      res.send(JSON.stringify({error: "ERROR: ADDING MSG FAIL"}));
    } else {
      console.log("success");
      res.send(JSON.stringify({success: "success"}));
    }
  });
}
var chattingid;
//gets the chatting id
var getchattingid = function(req, res) {
  console.log("FIRST GET CHAT ID: ");
  console.log("GETCHATTINGID: " + req.body.chattingroomID);
  chattingid = req.body.chattingroomID;
  res.send(JSON.stringify({success: "success"}));
}
//adds the chatting room for the user
var addchatroom = function(req, res) {
  console.log("TEST TRIAL: " + req.body.chattingroomID + ": " + req.session.username);
  var newchatroom = req.body.chattingroomID;
  var person = String(req.body.user);
  console.log("ROUTES CHATROOM ID: " + newchatroom);
  console.log(person);
  console.log(typeof person);
  db.addchatlist(person, newchatroom, function(err, data) {
    if (err) {
      console.log("add chatlist fail from routes")
      console.log(err);
      res.send(JSON.stringify({error: "ERROR: ADDING CHATLIST FAIL"}));
    } else {
      console.log("add chatlist success from routes");
      res.send(JSON.stringify({success: "success"}));
    }
  });
}
//adding chatroom for single person
var addchatroomSingle = function(req, res) {
  console.log("TEST TRIAL: " + req.body.chattingroomID + ": " + req.session.username);
  var newchatroom = req.body.chattingroomID;
  //var person = String(req.body.user);
  console.log("ROUTES CHATROOM ID: " + newchatroom);
  //console.log(person);
  //console.log(typeof person);
  db.addchatlist(req.session.username, newchatroom, function(err, data) {
    if (err) {
      console.log("add chatlist fail from routes")
      console.log(err);
      res.send(JSON.stringify({error: "ERROR: ADDING CHATLIST FAIL"}));
    } else {
      console.log("add chatlist success from routes");
      res.send(JSON.stringify({success: "success"}));
    }
  });
}
//delete left chat
var removeChatRoom = function(req, res) {
  //var count = JSON.stringify(req.body.chatnumber);
  //var countobject = JSON.parse(count);
  var todelete = req.body.toDelete;
  var lefter = req.body.lefter;
  //console.log("THIS SHOULD BE AN ARRAY" + count);
  db.removechatlist(lefter, todelete, function(err, data) {
    if (err) {
      console.log("remove chatlist fail from routes");
      console.log(err);
      res.send(JSON.stringify({error: "ERROR: REMOVE CHAT FAIL"}));
    } else {
      console.log("remove chatlist success from routes");
      res.send(JSON.stringify({success: "success"}));
    }
  });
}
//search for current chatlist
var chatlistsearch = function(req, res) {
  console.log("this is current user:" + req.session.username);
  //const chatter = req.body.user;
  const chatter = req.session.username;
  db.getchatlist(chatter, function(err, data) {
    if (err) {
      console.log("chatlist query fail routes");
      console.log(err);
      res.send(JSON.stringify({error: "ERROR: CHATLIST QUERY FAIL"}));
    } else {
      console.log("success for chatlist query routes");
      if(data === undefined) {
        res.send({});
      } else {
        //res.send(data);
        console.log(data);
        res.send({data: data});
      }
    }
  });
}
//searching chat
var chatSearch = function(req, res) {
  //const message = req.body.newMessage;
  //const roomID = message.chatroom;
  const roomID = req.body.room;
  db.msghistory(roomID, function(err, data) {
    if (err) {
      console.log("chat query fail");
      console.log(err);
      res.send(JSON.stringify({error: "ERROR: QUERY FAIL"}));
    } else {
      console.log("success for chat query");
      if(data === undefined) {
        res.send({});
      } else {
        res.send({allMessages: data.Items});
      }

      //console.log(data.Items.length);
      //res.send({allMessages: data.Items});
    }
  });
}

// retrieves posts to display on the wall
var show_wall = function(req, res) {
    if (req.session.username) {
        var username = req.params.username;
        db.getWall(username, function(err, data) {
            if (err) {
                console.log(err);
                res.send(JSON.stringify({error: "ERROR: Internal Server Error"}));
            } else {
                res.send(JSON.stringify(data));
            }
        })
    }
}

var visualize_friends = function(req, res) {
  db.profileLookup(req.session.username, function(err, data) {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      //indexNews(req, res);
      var graph = {"id": req.session.username, "name": data.name, "data": data.affiliation};
      var friends = [];
      if (data.friends !== undefined) {
        Object.entries(data.friends).forEach(entry => {
          var friend = {"id": entry[0], "name": entry[1].name, "data": "", "children": []};
          friends.push(friend);
        })
      }
      graph["children"] = friends;
      res.send(graph);
    }
  });
}

var expand_friends = function(req, res) {
    db.profileLookup(req.params.user, function(err, data) {
      if (err) {
        console.log(err);
        res.send(err);
      } else {
        //indexNews(req, res);
        var graph = {"id": req.params.user, "name": "", "data": ""}
        if (data.name !== undefined) {
          var graph = {"id": req.params.user, "name": data.name, "data": data.affiliation};
        }
        var friends = [];
        if (data.friends !== undefined) {
          Object.entries(data.friends).forEach(entry => {
            console.log(req.params.school);
            if (entry[1].affiliation === req.params.school) {
              var friend = {"id": entry[0], "name": entry[1].name, "data": entry[1].affiliation, "children": []};
              friends.push(friend);
            }
          });
        }
        graph["children"] = friends;
        res.send(graph);
      }
    });
}

// gets suggestions for the user based on the search input
var get_suggestion = function(req, res) {
    db.updateOnline(req.session.username);
    var prefix = req.params.prefix;
    var suggestions = [];
    var results = [];
    db.getPrefixResult(prefix, function(err, data) {
        console.log("ITEM: " + JSON.stringify(data));
        if (err) {
            res.send(JSON.stringify({error: "ERROR: Internal Server Error"}));
        } else {
            data.forEach(function(item, index) {
                if (!(suggestions.includes(item.username))) {
                    suggestions.push(item.username);
                    var search = {
                        'username': item.username,
                        'fullname': item.fullname
                    }
                    results.push(search);
                }
                if (index == data.length - 1) {
                    res.send(JSON.stringify(results));
                }
            })
        }
    })
}
//get online users
const onlineUsers = function(req, res) {
  db.getOnline(function(err, data) {
    if (err) {
      console.log('err from online')
    }
    else {
      var users = []
      data.forEach(item => {
        users.push(item['username']);
      })
      res.send(JSON.stringify({info : users}));
    }
  })
}

var routes = {
    getRegistration: get_registration,
    createAccount: create_account,
    loginCheck:login_check,
    getWall: get_wall,
    publicUpdate: public_update,
    privateUpdate: private_update,
    getHome: get_home,
    logout: logout,
    showPosts: show_posts,
    getNews: get_news,
    getArticle: getArticle,
    chatjoin: chatJoin,
    chatleave: chatLeave,
    getcurrentlogin: get_current_login,
    chatlistsearch : chatlistsearch,
    addchatmessages: addChatMessages,
    chathistorysearch: chatSearch,
    addtochatlist: addchatroom,
    addtochatlistsingle: addchatroomSingle,
    getchatid: getchattingid,
    removechatroom : removeChatRoom,
    //chatjoin: chatJoin,
    chatleave: chatLeave,
    addFriend: add_friend,
    sendRequest: send_request,
    deleteRequest: delete_request,
    unfriend: unfriend,
    getVisualizer: get_visualizer,
    chatjoin: chatJoin,
    chatleave: chatLeave,
    getDist: getDist,
    indexNews: indexNews,
    indexUsers: indexUsers,
    addPost: add_post,
    showWall: show_wall,
    getchat: get_chat,
    profilePic: profilePic,
    upload: upload,
    profileLookup: profileLookup,
    getPic: getPic,
    spawnAdsorption: spawnAdsorption,
    timeLivy: timeLivy,
    articleImages: articleImages,
    getNewsToday: getNewsToday,
    articleLikes: articleLikes,
    addProfilePost: add_profile_post,
    getAllUsers: getAllUsers,
    getSuggestion: get_suggestion,
    imagePost: imagePost,
    myprofile: my_profile,
    visualizeFriends: visualize_friends,
    expandFriends: expand_friends,
    onlineUsers: onlineUsers,
    friendsLookup: friendsLookup,
    getfullname: get_fullname,
    friendPost: friendPost,
};

module.exports = routes;
