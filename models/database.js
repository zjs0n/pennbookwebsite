var AWS = require('aws-sdk');
var fs = require('fs');
var bcrypt = require('bcrypt');
const stemmer = require("stemmer");
const request = require('request');
const cheerio = require('cheerio');
const JSON5 = require('json5');
const { chatlistsearch } = require('../routes/routes');
AWS.config.update({region:'us-east-1'});
var db = new AWS.DynamoDB.DocumentClient();
var db1 = new AWS.DynamoDB();
var s3 = new AWS.S3();

//number of hash cycles that occur in bcrypt
const saltRounds = 10;


//sets the profile information of the Users table
const profileInfo = function(info, callback) {
    //hashes password
    bcrypt.hash(info.password, saltRounds, function(err, hash) {
        if (err) {
            callback(err, null);
        }
        else {
            var params = {
                TableName: "Users",
                Item: {
                    'username': info.username,
                    'password': hash,
                    'first_name': info.fname,
                    'last_name': info.lname,
                    'name': info.fname + " " + info.lname,
                    "email": info.email,
                    "birthday": info.bday,
                    "joined": info.joined,
                    "affiliation": info.affiliation,
                    "interests": info.interests,
                    "friends": {
                    },
                    "profileURL": info.url
                }
            }
            db.put(params, function(err, data) {
                if (err) {
                    console.log(err);
                    callback(err, null);
                }
                else {
                    callback(err, data);
                }
            });
        }
    });
}
//puts the image url in the profile
const profilePic = function(username, url, callback) {
    var params = {
        TableName: "Users",
        Key: {
            "username": username
        },
        UpdateExpression: "set profileURL = :url",
        ExpressionAttributeValues: {
            ":url": url
        }
    }

    db.update(params, function(err, data) {
        if (err) {
            console.log("There's an error");
            console.log(err);
            callback(err, null);
        }
        else {
            callback(err, data.Items);
        }
    });
}

//queries table for the user to see if user exists
const profileLookup = function(username, callback) {
    var params = {
        TableName: "Users",
        KeyConditionExpression: "#user = :username",
        ExpressionAttributeNames: {
            "#user": "username",
        },
        ExpressionAttributeValues: {
            ":username": username,
        }
    }
    console.log("USERNAME3: " + username);
    console.log("OH");
    db.query(params, function(err, data) {
        if (err || data.Items.length == 0) {
            console.log(err);
            callback(err, null);
        }
        else {
            //console.log(data);
            callback(err, data.Items[0]);
        }
    });
}

const loginLookup = function(username, password, callback) {
    profileLookup(username, function(err, data) {
        if (err) {
            console.log(err);
            callback(err, null);
        }
        else if (!data) {
            callback(err, null);
        }
        else {
            if (username == data.username) {
                bcrypt.compare(password, data.password, function(err, res) {
                    console.log(err);
                    if (res == true) {
                        //returns true to callback signifying that the password username and name all matched
                        callback(err, 1);
                    }
                    else {
                        //password didn't match
                        callback(err, 0)
                    }
                });
            }
            else {
                callback(err, null);
            }

        }
    })
}

//changes data that will be posted on wall
const publicProfileUpate = function(info, callback) {
    var params = {
        TableName: "Users",
        Key: {
            "username": info.username
        },
        UpdateExpression: "set affiliation = :affiliation, interests = :interests",
        ExpressionAttributeValues: {
            ":affiliation": info.affiliation,
            ":interests": info.interests
        }
    }

    profileLookup(info.username, function(err, data) {
        if (err) {
            console.log(err);
            console.log('inside public profile update');
        }
        else {
            let postInterest = info.interests.filter(x => !data.interests.includes(x));
            let noPostInterest = data.interests.filter(x => !info.interests.includes(x));
            let name = data.name;
            console.log(postInterest);
            console.log(noPostInterest);
            db.update(params, function(e, d) {
                if (e) {
                    console.log(err);
                    callback(err, null);
                }
                else {
                    statusPost(info.username, name, postInterest, noPostInterest, info.affiliation, data.affiliation);
                    callback(err, d);
                }
            });
        }
    });
}

//changes data that shouldn't be posted on wall
const privateProfileUpdate = function(info, callback) {
    bcrypt.hash(info.password, saltRounds, function(err, hash) {
        if (err) {
            callback(err, null);
        }
        else {
            var params = {
                TableName: "Users",
                Key: {
                    "username": info.username
                },
                UpdateExpression: "set email = :email, password = :password",
                ExpressionAttributeValues: {
                    ":email": info.email,
                    ":password": hash
                }
            }

            db.update(params, function(err, data) {
                if (err) {
                    console.log(err);
                    callback(err, null);
                }
                else {
                    console.log('updated private profile');
                    callback(err, data);
                }
            })

        }
    });

}

const updateFriendsAffiliation = function(user, affiliation, callback) {
  var lookupParams = {
      TableName: "Users",
      KeyConditionExpression: "#user = :username",
      ExpressionAttributeNames: {
          "#user": "username",
      },
      ExpressionAttributeValues: {
          ":username": user,
      }
  }

  db.query(lookupParams, function(err, data) {
      if (err || data.Items.length == 0) {
          console.log(err);
          callback(err);
      }
      else {
        var promises = [];
        Object.keys(data.Items[0].friends).forEach(friend => {
          var promise = new Promise((resolve, reject) => {
            var userParams = {
              TableName: 'Users',
              Key: { "username": friend },
              ReturnValues: 'ALL_NEW',
              UpdateExpression: "SET friends.#friend.affiliation = :affiliation",
              ExpressionAttributeNames: { "#friend" : user },
              ExpressionAttributeValues: { ":affiliation" : affiliation },
              ConditionExpression: "attribute_exists(friends.#friend) AND attribute_exists(friends)",
            }

            db.update(userParams, function(err, data) {
                if (err) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
          });
          promises.push(promise);
        });
        var called = false;
        Promise.all(promises).then(function(response) {
          called = false || response;
        })
        callback(called);
      }
    });
}

const updateFriendsPic = function(user, url, callback) {
  var lookupParams = {
      TableName: "Users",
      KeyConditionExpression: "#user = :username",
      ExpressionAttributeNames: {
          "#user": "username",
      },
      ExpressionAttributeValues: {
          ":username": user,
      }
  }

  db.query(lookupParams, function(err, data) {
      if (err || data.Items.length == 0) {
          console.log(err);
          callback(err);
      }
      else {
        var promises = [];
        Object.keys(data.Items[0].friends).forEach(friend => {
          var promise = new Promise((resolve, reject) => {
            var userParams = {
              TableName: 'Users',
              Key: { "username": friend },
              ReturnValues: 'ALL_NEW',
              UpdateExpression: "SET friends.#friend.ppic = :ppic",
              ExpressionAttributeNames: { "#friend" : user },
              ExpressionAttributeValues: { ":ppic" : url },
              ConditionExpression: "attribute_exists(friends.#friend) AND attribute_exists(friends)",
            }

            db.update(userParams, function(err, data) {
                if (err) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
          });
          promises.push(promise);
        });
        var called = false;
        Promise.all(promises).then(function(response) {
          called = false || response;
        })
        callback(called);
      }
    });
}

//retrieves information of news based on query id
const getNewsToday = function(callback) {
    let ts = new Date();
    var offset = -300; //Timezone offset for EST in minutes.
    var est = new Date(ts.getTime() + offset*60*1000);

    // prints date & time in YYYY-MM-DD format of today's date
    //CHANGE SEEN TO OPEN LATER FOR PROPER QUERYING
    let date = est.toISOString().slice(0,10)

    var params = {
        TableName: "newsData",
        IndexName: "open-date-index",
        KeyConditionExpression: "#open = :open and #date = :date",
        ExpressionAttributeNames: {
            "#open": "open",
            "#date": "date"
        },
        ExpressionAttributeValues: {
            ":open": "true",
            ":date": date
        }
    }
    db.query(params, function(err, data) {
        if (err) {
            console.log(err);
            callback(err, null)
        }
        else {
            callback(null, data.Items);
        }
    })
}
const getNewsData = function(multiple, callback) {
    let ts = new Date();
    var offset = -300; //Timezone offset for EST in minutes.
    var est = new Date(ts.getTime() + offset*60*1000);

    // prints date & time in YYYY-MM-DD format of today's date
    //CHANGE SEEN TO OPEN LATER FOR PROPER QUERYING
    let date = est.toISOString().slice(0,10)
    console.log(date);

    var info;
    var promiseArr = [];
    //splits the word into individual words to query and stems and lower cases them
    multiple.forEach(word => {
        word = word.toLowerCase();
        word = stemmer(word);

        let params = {
            TableName: 'news',
            KeyConditionExpression: '#keyword = :keyword',
            ExpressionAttributeNames: {
                '#keyword': 'keyword'
            },
            ExpressionAttributeValues: {
                ':keyword': word
            }
        };
        //appends a new promise to query DynamoDB into a list
        promiseArr.push(db.query(params).promise());
    });

    var newsFromPromises = [];
    //uses the results from keywords to now query for the article itself
    //change date to <= later
    Promise.all(promiseArr).then(arr => {
        arr.forEach(entry => {
            info = entry.Items;
            info.forEach(newsEntry => {
                var sub_params = {
                    TableName: "newsData",
                    KeyConditionExpression: "#id = :id",
                    FilterExpression: "#date <= :date",
                    ExpressionAttributeNames: {
                        "#id": "id",
                        "#date": "date"
                    },
                    ExpressionAttributeValues: {
                        ":id": newsEntry['id'],
                        ":date":date
                    }
                }
                newsFromPromises.push(db.query(sub_params).promise());
            })
        });
        //finally use cheerio to scrape each url for their respective image and clean up the data before rendering
        Promise.all(newsFromPromises).then(arr => {
            var tableEntries = new Set();
            var ids = {};
            //sorts based on number of search terms
            arr.forEach(item => {
                if (item.Items.length != 0) {
                    tableEntries.add((item.Items[0]));
                    var tempform = JSON.stringify(item.Items[0]);
                    if (tempform in ids) {
                        ids[tempform] = ids[tempform] + 1;
                    }
                    else {
                        ids[tempform] = 1;
                    }
                }
            });
            let keys = Object.keys(ids);
            keys.sort(function(a, b) {
                return ids[b] - ids[a];
            });

            //sorts by the date after sorting by matches
            keys.sort(function(a, b) {
                return JSON.parse(b).date.localeCompare(JSON.parse(a).date);
            })
            tableEntries = keys.map(item => JSON5.parse(item));
            console.log('sending entries');
            callback(tableEntries);
        });
    });
}

//uses date as global secondary index
const getNewsDist = function(username, callback) {
    let ts = new Date();
    var offset = -300; //Timezone offset for EST in minutes.
    var est = new Date(ts.getTime() + offset*60*1000);

    // prints date & time in YYYY-MM-DD format of today's date
    //CHANGE SEEN TO OPEN LATER FOR PROPER QUERYING
    let date = est.toISOString().slice(0,10)
    console.log(date + " " + username);
    var params = {
        TableName: "newsDistribution",
        KeyConditionExpression: "#user = :username",
        FilterExpression: "#date = :date and #seen <> :seen",
        ExpressionAttributeNames: {
            '#date': 'date',
            '#user': 'user',
            '#seen' : 'seen'
        },
        ExpressionAttributeValues: {
            ':date': date,
            ':username': username,
            ':seen': "true"
        }
    }

    db.query(params, function(err, data) {
        if(err) {
            console.log(err);
        }
        else {
            callback(data.Items);
        }
    });
}

//grabs the news data at each iteration of the livy job
const getNews = function(id, callback) {
    var params = {
        TableName: "newsData",
        KeyConditionExpression: "#id = :id",
        ExpressionAttributeNames: {
            "#id": "id",
        },
        ExpressionAttributeValues: {
            ":id": id
        }
    }
    db.query(params, function(err, data) {
        if(err) {
            console.log(err);
            callback(err, null)
        }
        else {
            console.log(data.Items);
            callback(null, data.Items);
        }
    });
}

//after we put an article in the feed, we prevent it from being seen again
const updateSeen = function(id, name, callback) {
    var paramsChange = {
        TableName: "newsDistribution",
        Key: {
            "user": name,
            "article": id
        },
        UpdateExpression: "set seen = :seen",
        ExpressionAttributeValues: {
            ":seen":"true"
        }
    }

    var paramsDist = {
        TableName: "newsDistribution",
        IndexName: "seen-index",
        KeyConditionExpression: "#seen = :seen",
        ExpressionAttributeNames: {
            "#seen": "seen",
        },
        ExpressionAttributeValues: {
            ":seen": "true"
        }
    }

    db.update(paramsChange, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("updated seen to " + name);
            db.query(paramsDist, function(err, d) {
                var string = "";
                d.Items.forEach(item => {
                    string = item.article + " " + item.user + " " + "true" + "\n" + string;
                });
                fs.writeFileSync("seenArticles.txt", string);
                callback(d);
            })
        }
    });
}
//article likes
const articleLikes = function(user, id, list, count, callback) {
    var promises = [];
    console.log('the list is ');
    console.log(list);
    console.log(list.length);
    getNews(id, function(err, data) {
        if (err) {
            console.log('getNews');
            console.log(err);
        }
        else {
            console.log('the data is');
            console.log(data);
            var d = data[0];
            d.posts.forEach(item => {
                console.log('the current posts is');
                console.log(item);
                var params = {
                    TableName: "Posts",
                    Key: {
                        "wall_id": item[0],
                        "post_id": item[1]
                    },
                    UpdateExpression: "SET #like_list = :like_list, #likes = :likes",
                    ExpressionAttributeNames : {
                      "#likes" : "likes",
                      '#like_list': "like_list"
                    },
                    ExpressionAttributeValues: {
                      ":likes": count,
                      ":like_list": list
                   }
                }

                promises.push(new Promise ((resolve, reject) => {
                    db.update(params, function(err, data) {
                        if (err) {
                            reject(new Error('Cannot update the table at this moment: ' + err));
                        } else {
                            console.log("Query succeeded.");
                            resolve(data);
                        }
                    });
                }));

            });

            Promise.all(promises).then((values) => {
                console.log('updated article likes db');
                callback(null, values);
            });

        }
    })
}

//we delete the article from the distribution to avoid updating it
const deleteArticle = function(username, id) {
    var params = {
        TableName: "newsDistribution",
        Key: {
            "user" : username,
            "article" : id
        }
    }

    db.delete(params, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("successfully deleted " + id);
        }
    })
}


// retrieves all of the posts for the user (including their friends')
const getPosts = function (username, callback) {
    var postIdList = [];
    var params_friend = {
        TableName: "Users",
        KeyConditionExpression: "#user = :username",
        ExpressionAttributeNames: {
            "#user": "username",
        },
        ExpressionAttributeValues: {
            ":username": username,
        }
    }

    // Get posts for user + user's friends
    var promises = [];
    var allPostsSet = new Set();
    var friends;
    db.query(params_friend).promise().then(function(data) {

        friends = data.Items[0].friends;
        for (var key in friends) {
            var params = {
                TableName: "Posts",
                KeyConditionExpression: "#wall_id = :wall_id",
                FilterExpression: "#type <> :type",
                ExpressionAttributeNames: {
                    "#wall_id": "wall_id",
                    "#type": "type"
                },
                ExpressionAttributeValues: {
                    ":wall_id": key,
                    ":type": "news"
                }
            }

            promises.push(new Promise ((resolve, reject) => {
                db.query(params, function(err, data) {
                    if (err) {
                        reject(new Error('Cannot query the table at this moment: ' + err));
                    } else {
                        console.log("Query succeeded.");
                        data.Items.forEach(function (item) {
                            allPostsSet.add(item);
                        });
                        resolve(data);
                    }
                });
            }));
        }

        var params = {
            TableName: "Posts",
            KeyConditionExpression: "#wall_id = :wall_id",
            ExpressionAttributeNames: {
                "#wall_id": "wall_id",
            },
            ExpressionAttributeValues: {
                ":wall_id": username,
            }
        }

        promises.push(new Promise ((resolve, reject) => {
            db.query(params, function(err, data) {
                if (err) {
                    reject(new Error('Cannot query the table at this moment: ' + err));
                } else {
                    console.log("Query succeeded.");
                    data.Items.forEach(function (item) {
                        allPostsSet.add(item);
                    });
                    resolve(data);
                }
            })
        }));

        var postsFinal = [];
        postsFinal.push(postIdList);
        postsFinal.push(username);
        if (friends === undefined) {
            var array = [];
            postsFinal.push(array);
        } else {
            postsFinal.push(friends);
        }
        // allPostsSet now includes all the posts to be displayed.
        Promise.all(promises).then((values) => {
            var allPosts = Array.from(allPostsSet);
            var promises2 = [];
            var promises3= [];
            allPosts.forEach(function(item, index) {
                if (item !== null) {
                    var post = {
                        'content': item.content,
                        'creator': item.creator,
                        'receiver': item.receiver,
                        'date': item.date,
                        'type': item.type,
                        'post_id': item.post_id,
                        'parent': item.parent,
                        'like' : item.likes,
                        'wall_id': item.wall_id,
                        'creator_name': item.creator_name,
                        'receiver_name': item.receiver_name,
                        'like_list': item.like_list,
                        'children': []
                    };

                    var params2 = {
                        TableName: "Comments",
                        KeyConditionExpression: "#parent = :parent",
                        ExpressionAttributeNames: {
                            "#parent": "parent",
                        },
                        ExpressionAttributeValues: {
                            ":parent": post.post_id,
                        }
                    }
                    if (!(postsFinal[0].includes(item.post_id))) {
                        postsFinal[0].push(item.post_id);
                        promises2.push(new Promise ((resolve, reject) => {
                            db.query(params2, function(err, data) {
                                if (err) {
                                    reject(new Error('Cannot query the table at this moment: ' + err));
                                } else {
                                    console.log("Query succeeded.");
                                    data.Items.forEach(function (item, index) {
                                        var comment = {
                                            'content': item.content,
                                            'creator': item.creator,
                                            'receiver': item.receiver,
                                            'date': item.date,
                                            'type': item.type,
                                            'post_id': item.post_id,
                                            'parent': item.parent,
                                            'creator_name': item.creator_name,
                                            'receiver_name': item.receiver_name,
                                            'children': []
                                        };

                                        var params3 = {
                                            TableName: "Comments",
                                            KeyConditionExpression: "#parent = :parent",
                                            ExpressionAttributeNames: {
                                                "#parent": "parent",
                                            },
                                            ExpressionAttributeValues: {
                                                ":parent": comment.post_id,
                                            }
                                        }

                                        promises3.push(new Promise ((resolve, reject) => {
                                            db.query(params3).promise().then(function(data) {
                                                data.Items.forEach(function (item, index) {
                                                    var subcomment = {
                                                        'content': item.content,
                                                        'creator': item.creator,
                                                        'receiver': item.receiver,
                                                        'post_id': item.post_id,
                                                        'parent': item.parent,
                                                        'date': item.date,
                                                        'creator_name': item.creator_name,
                                                        'receiver_name': item.receiver_name
                                                    }
                                                    comment.children.push(subcomment);
                                                    postsFinal[0].push(subcomment.post_id);
                                                })
                                                post.children.push(comment);
                                                postsFinal[0].push(comment.post_id);
                                                resolve(data);
                                            }).catch(function(err) {
                                                console.log(err);
                                                callback(err, null);
                                            });
                                        }));

                                    })
                                    postsFinal.push(post);
                                    resolve(data);
                                }
                            })
                        }));
                    }
                }
            })
            Promise.all(promises2).then((values) => {
                Promise.all(promises3).then((values) => {
                    postsFinal.sort(function(a,b){
                        return b.post_id - a.post_id;
                    });
                    callback(null, postsFinal);
                }).catch(function(err) {
                    console.log(err);
                    callback(err, null);
                });

            }).catch(function(err) {
                console.log(err);
                callback(err, null);
            });
        }).catch(function(err) {
            console.log(err);
            callback(err, null);
        });

    }).catch(function(err) {
        console.log(err);
        callback(err, null);
    });
}
const updateNewsSeen = function(id, postSeen, callback) {
    var params = {
        TableName: "newsData",
        Key: {
            "id": id
        },
        UpdateExpression: "set #posts = :posts",
        ExpressionAttributeNames: {
            "#posts": "posts"
        },
        ExpressionAttributeValues: {
            ":posts": postSeen
        }
    }
    db.update(params, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {
            console.log(data);
            callback();
        }
    })
}

const imagePost = function(postData, callback) {

    var params = {
        TableName: "Posts",
        Item: {
            'wall_id': postData.wall_id,
            'post_id': postData.post_id + "",
            'content': JSON.stringify(postData.content),
            'creator': postData.creator,
            'date': postData.date,
            'parent': postData.parent,
            'receiver': postData.receiver,
            'type': "image",
            'likes': 0,
            'creator_name': postData.name,
            'receiver_name': postData.name,
            'like_list': [],
        }
    }

    db.put(params, function(err, data) {
        if (err) {
            console.log(err);
            callback(err, null);
        }
        else {
            console.log('succesfully created a image post update');
            callback(null, data);
        }
    });
}
//friend post
const friendPost = function(info, callback) {
    var dateObj = new Date();
    var result = Math.floor(dateObj.getTime() / 1000.0);
    var date2 = dateObj.toISOString();
    console.log(dateObj);

    console.log('receiver ' + info.receiver);
    console.log('sender' + info.sender);

    var username = info.receiver;
    var name = info.receiver_name;
    var content = {'receiver': info.receiver_name,
                   'sender': info.sender_name,
                    'icon': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-person-check-fill" viewBox="0 0 16 16">
                    <path fill-rule="evenodd" d="M1 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9.854-2.854a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 0 1 .708-.708L12.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0z"/>
                  </svg>`};

    var params = {
            TableName: "Posts",
            Item: {
                'wall_id': username,
                'post_id': result.toString(),
                'content': JSON.stringify(content),
                'creator': username,
                'date': date2,
                'parent': username,
                'receiver': username,
                'type': "friends",
                'likes': 0,
                'creator_name': name,
                'receiver_name': name,
                'like_list': [],
            }
    }

    var username2 = info.sender;
    var name2 = info.sender_name;
    var content2 = {'receiver': info.sender_name,
                   'sender': info.receiver_name,
                    'icon': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-person-check-fill" viewBox="0 0 16 16">
                    <path fill-rule="evenodd" d="M1 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9.854-2.854a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 0 1 .708-.708L12.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0z"/>
                  </svg>`};

    var params2 = {
        TableName: "Posts",
            Item: {
                'wall_id': username2,
                'post_id': (result + 1).toString(),
                'content': JSON.stringify(content2),
                'creator': username2,
                'date': date2,
                'parent': username2,
                'receiver': username2,
                'type': "friends",
                'likes': 0,
                'creator_name': name2,
                'receiver_name': name2,
                'like_list': [],
            }
    }
    db.put(params, function(err, data) {
        if (err) {
            callback(err, null);
        }
        else {
            db.put(params2, function(e, d) {
                if (e) {
                    callback(e, null);
                }
                else {
                    callback(null, d.Items);
                }
            })

        }
    });
}

const statusPost = function(username, name, newInterest, oldInterest, affiliation, oldAffiliation) {
    var dateObj = new Date();
    var result = Math.floor(dateObj.getTime() / 1000.0);
    var date2 = dateObj.toISOString();
    console.log(dateObj);

    var promises = [];
    console.log('current affiliation is ' + affiliation);
    console.log('old affiliation is ' + oldAffiliation);
    if (affiliation != oldAffiliation) {
        var text = {'text': `${name} now attends ${affiliation}`,
                    'icon': `<svg width="3em" height="3em" viewBox="0 0 16 16" class="bi bi-building" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M14.763.075A.5.5 0 0 1 15 .5v15a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V14h-1v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V10a.5.5 0 0 1 .342-.474L6 7.64V4.5a.5.5 0 0 1 .276-.447l8-4a.5.5 0 0 1 .487.022zM6 8.694L1 10.36V15h5V8.694zM7 15h2v-1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V15h2V1.309l-7 3.5V15z"/>
                    <path d="M2 11h1v1H2v-1zm2 0h1v1H4v-1zm-2 2h1v1H2v-1zm2 0h1v1H4v-1zm4-4h1v1H8V9zm2 0h1v1h-1V9zm-2 2h1v1H8v-1zm2 0h1v1h-1v-1zm2-2h1v1h-1V9zm0 2h1v1h-1v-1zM8 7h1v1H8V7zm2 0h1v1h-1V7zm2 0h1v1h-1V7zM8 5h1v1H8V5zm2 0h1v1h-1V5zm2 0h1v1h-1V5zm0-2h1v1h-1V3z"/>
                  </svg>`};
        var params = {
            TableName: "Posts",
            Item: {
                'wall_id': username,
                'post_id': result.toString(),
                'content': JSON.stringify(text),
                'creator': username,
                'date': date2,
                'parent': username,
                'receiver': username,
                'type': "status",
                'likes': 0,
                'creator_name': name,
                'receiver_name': name,
                'like_list': [],
            }
        }
        promises.push(db.put(params).promise());
    }

    if (newInterest.length > 0) {
        var newString = `${name} is now interested in ${newInterest.toString().replace(',', ', ')}`;
        var text = {'text': newString,
                    'icon': `<svg width="3em" height="3em" viewBox="0 0 16 16" class="bi bi-person" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M10 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6 5c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/>
                  </svg>`};

        var paramsNew = {
            TableName: "Posts",
            Item: {
                'wall_id': username,
                'post_id': (result + 1).toString(),
                'content': JSON.stringify(text),
                'creator': username,
                'date': date2,
                'parent': username,
                'receiver': username,
                'type': "status",
                'likes': 0,
                'creator_name': name,
                'receiver_name': name,
                'like_list': [],
            }
        }
        promises.push(db.put(paramsNew).promise());
    }


    if (oldInterest.length > 0) {
        var oldString = `${name} is no longer interested in ${oldInterest.toString().replace(',', ', ')}`;
        var text = {'text': oldString,
                    'icon': `<svg width="3em" height="3em" viewBox="0 0 16 16" class="bi bi-person" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M10 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6 5c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/>
                  </svg>`};
        var paramsOld= {
            TableName: "Posts",
            Item: {
                'wall_id': username,
                'post_id': (result + 2).toString(),
                'content': JSON.stringify(text),
                'creator': username,
                'date': date2,
                'parent': username,
                'receiver': username,
                'type': "status",
                'likes': 0,
                'creator_name': name,
                'receiver_name': name,
                'like_list': [],
            }
        }
        promises.push(db.put(paramsOld).promise());
    }

    console.log(promises);

    Promise.all(promises).then(arr => {
       console.log('finished adding all the entries');
    });
}

const picturePost = function(postData, callback) {
    profileLookup(postData.wall_id, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {
            var fullname = data.name;
            var params = {
                TableName: "Posts",
                Item: {
                    'wall_id': postData.wall_id,
                    'post_id': postData.post_id,
                    'content': postData.content,
                    'creator': postData.creator,
                    'date': postData.date,
                    'parent': postData.parent,
                    'receiver': postData.receiver,
                    'type': 'profile',
                    'likes': postData.likes,
                    'creator_name': fullname,
                    'receiver_name': fullname,
                    'like_list': postData.like_list,
                }
            }
            db.put(params, function(err, data) {
                if (err) {
                    console.log(err);
                    callback(err, null);
                }
                else {
                    console.log('succesfully created a profile picture update');
                    callback(null, data);
                }
            });
        }
    })
}

//updates the user once they have done a certain action
const updateOnline = function(username) {
    var dateObj = new Date();
    var result = Math.floor(dateObj.getTime() / 1000.0);

    var params = {
        TableName: "onlineUsers",
        Key: {
            "username": username
        },
        UpdateExpression: "set #online = :online, #in = :in",
        ExpressionAttributeNames: {
            "#online": "online",
            "#in": "in"
        },
        ExpressionAttributeValues: {
            ":online": result,
            ":in": "true"
        }
    }
    db.update(params, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {
            console.log(username + "being updated online");
            console.log(data);
        }
    })
}

//retrives all users who are within 10 minutes from the current time
const getOnline = function(callback) {
    var dateObj = new Date();
    var result = Math.floor(dateObj.getTime() / 1000.0);
    var currResult = result - 300;
    var params = {
        TableName: "onlineUsers",
        IndexName: "in-online-index",
        KeyConditionExpression: "#in = :in and #online >= :online",
        ExpressionAttributeNames: {
            "#in": "in",
            "#online": "online"
        },
        ExpressionAttributeValues: {
            ":in": "true",
            ":online": currResult
        }
    }
    db.query(params, function(err, data) {
        if (err) {
            console.log(err);
            console.log('in getOnline');
            callback(err, null);
        }
        else {
            console.log('users online');
            callback(null, data.Items);
        }
    })
}

const deleteOnline = function(username) {
    var params = {
        TableName: "onlineUsers",
        Key: {
            "username": username
        }
    }
    db.delete(params, function(err, data) {
        if (err) {
            console.log('error from delete online');
            console.log(err);
        }
        else {
            console.log(`succesfully deleted ${username}`);
        }
    })
}

const addNewsPost = function(postData, callback) {
    var dateObj = new Date();
    var result = Math.floor(dateObj.getTime() / 1000.0);
    var date2 = dateObj.toISOString();
    var params = {
        TableName: "Posts",
        Item: {
            'wall_id': postData.wall_id,
            'post_id': result.toString(),
            'content': postData.content,
            'creator': postData.creator,
            'date': date2,
            'parent': postData.parent,
            'receiver': postData.receiver,
            'type': postData.type,
            'likes': postData.likes,
            'creator_name': postData.receiver_name,
            'receiver_name': postData.receiver_name,
            'like_list': postData.like_list,
        }
    }

    db.put(params, function(err, data) {
        if (err) {
            console.log(err);
            callback(err, null);
        }
        else {
            var content = JSON.parse(postData.content);
            if (content.posts) {
                var seen = content.posts;
            }
            else {
                var seen = []
            }
            seen.push([postData.wall_id, result.toString()]);
            console.log(seen);
            updateNewsSeen(content.id, seen, function() {
                callback(err, data);
            })
            console.log("seen is" + seen);
        }
    });
}

const addPost = function (postData, callback) {
    var creatorName;
    var receiverName;
    profileLookup(postData.body.creator, function(err, data) {
        console.log("1 " + data);
        creatorName = data.name;
        profileLookup(postData.body.receiver, function(err, data) {
            console.log("2 " + data);
            receiverName = data.name;
            if (postData.body.type === "post" || postData.body.type == "news") {
                console.log("3");
                var params = {
                    TableName: "Posts",
                    Item: {
                        'wall_id': postData.body.wall_id,
                        'post_id': postData.body.post_id,
                        'content': postData.body.content,
                        'creator': postData.body.creator,
                        'date': postData.body.date,
                        'parent': postData.body.parent,
                        'receiver': postData.body.receiver,
                        'likes': postData.body.like,
                        'creator_name': creatorName,
                        'receiver_name': receiverName,
                        'like_list': [],
                        'type': postData.body.type
                    }
                }

                db.put(params, function(err, data) {
                    if (err) {
                        console.log(err);
                        callback(err, null);
                    }
                    else {
                        callback(err, data);
                    }
                });
            } else if (postData.body.type === "comment" || postData.body.type === "subcomment") {
                var params = {
                    TableName: "Comments",
                    Item: {
                        'wall_id': postData.body.wall_id,
                        'post_id': postData.body.post_id,
                        'content': postData.body.content,
                        'creator': postData.body.creator,
                        'date': postData.body.date,
                        'parent': postData.body.parent,
                        'receiver': postData.body.receiver,
                        'type': postData.body.type,
                        'creator_name': creatorName,
                        'receiver_name': receiverName
                    }
                }

                db.put(params, function(err, data) {
                    if (err) {
                        console.log(err);
                        callback(err, null);
                    }
                    else {
                        callback(err, data);
                    }
                });
            }
        })
    })
};


const deletePost = function (postData, callback) {

    if (postData.body.type === "post") {
        var params = {
            TableName: "Posts",
            Key:{
                "wall_id": postData.body.wall_id,
                "post_id": postData.body.post_id
            }
        }

        var params2 = {

            TableName: "Comments",
            KeyConditionExpression: "#parent = :parent",
            ExpressionAttributeNames: {
                "#parent": "parent",
            },
            ExpressionAttributeValues: {
                ":parent": postData.body.post_id,
            }
        }

        var params4 = {
            TableName: "Comments",
            Key:{
                "parent": postData.body.post_id,
            }
        }

        var promises1 = [];
        var promises2 = [];
        db.delete(params, function(err, data) {
            // for each comment
            db.query(params2, function(err, data) {
                console.log("hello");
                console.log(err);
                console.log("HI");
                data.Items.forEach(function(item1, index) {
                    var params3 = {
                        TableName: "Comments",

                        Key:{
                            "parent": postData.body.post_id,
                            "post_id": item1.post_id
                        }
                    }

                    promises1.push(new Promise ((resolve, reject) => {
                        db.delete(params3, function(err, data) {
                            if (err) {
                                reject(new Error('Cannot query the table at this moment: ' + err));
                            } else {
                                var params4 = {

                                    TableName: "Comments",
                                    KeyConditionExpression: "#parent = :parent",
                                    ExpressionAttributeNames: {
                                        "#parent": "parent",
                                    },
                                    ExpressionAttributeValues: {
                                        ":parent": item1.post_id,
                                    }
                                }

                                db.query(params4, function(err, data) {
                                    data.Items.forEach(function(item2, index) {
                                        promises2.push(new Promise((resolve, reject) => {
                                            if (err) {
                                                reject(new Error('Cannot query the table at this moment: ' + err));
                                            } else {
                                                var params5 = {
                                                    TableName: "Comments",

                                                    Key: {
                                                        "parent": item1.post_id,
                                                        "post_id": item2.post_id
                                                    }
                                                }

                                                db.delete(params5, function(err, data) {
                                                    if (err) {
                                                        reject(new Error('Cannot query the table at this moment: ' + err));
                                                    } else {
                                                        resolve(data);
                                                    }
                                                })
                                            }
                                        }));
                                    })
                                })
                                resolve(data);
                            }
                        })
                    }));
                })
            })
            Promise.all(promises1).then((values) => {
                Promise.all(promises2).then((values) => {
                    callback(null, values);
                }).catch(function(err) {
                    console.log(err);
                    callback(err, null);
                });

            }).catch(function(err) {
                console.log(err);
                callback(err, null);
            });

        });
    } else if (postData.body.type === "comment") {
        console.log("HI");
        var params = {
            TableName: "Comments",
            KeyConditionExpression: "#parent = :parent",
            ExpressionAttributeNames: {
                "#parent": "parent",
            },
            ExpressionAttributeValues: {
                ":parent": postData.body.post_id,
            }
        }
        console.log("PARENT: " + postData.body.parent);
        var params2 = {
            TableName: "Comments",
            Key:{
                "parent": postData.body.parent,
                "post_id": postData.body.post_id
            }
        }
        var promises = [];
        db.delete(params2, function(err, data) {
            if (err) {
                console.log(err);
            } else {
                db.query(params, function(err, data) {
                    console.log("HELLO");
                    data.Items.forEach(function(item, index) {

                        promises.push(new Promise((resolve, reject) => {
                            if (err) {
                                reject(new Error('Cannot query the table at this moment: ' + err));
                            } else {
                                var params5 = {
                                    TableName: "Comments",

                                    Key: {
                                        "parent": postData.body.post_id,
                                        "post_id": item.post_id
                                    }
                                }
                                db.delete(params5, function(err, data) {
                                    if (err) {
                                        reject(new Error('Cannot query the table at this moment: ' + err));
                                    } else {
                                        resolve(data);
                                    }
                                })
                            }
                        }));
                    })
                })

            }
        })

        Promise.all(promises).then((values) => {
            callback(null, values);
        }).catch(function(err) {
            console.log(err);
            callback(err, null);
        });

    } else {
        var params = {
            TableName: "Comments",
            Key:{
                "parent": postData.body.parent,
                "post_id": postData.body.post_id
            }
        }
        db.delete(params, function(err, data) {
            if(err) {
                console.log(err);
            } else {
                callback(err, data);
            }
        })
    }
}
const getOnePost = function(wall_id, post_id, callback) {
    var params = {
        TableName: "Posts",
        KeyConditionExpression: "#wall_id = :wall_id and #post_id = :post_id",
        ExpressionAttributeNames: {
            "#wall_id": "wall_id",
            "#post_id": "post_id"
        },
        ExpressionAttributeValues: {
            ":wall_id": wall_id,
            ":post_id": post_id
        }
    }

    db.query(params, function(err, data) {
        if (err) {
            console.log(err);
            console.log("in getOnePost");
            callback(err, null);
        }
        else {
            console.log(wall_id);
            console.log(post_id);
            console.log(data.Items);
            callback(null, data.Items[0]);
        }
    });
}
const updateLikes = function(postData, callback) {
    var params2 = {
        TableName: "Posts",
        KeyConditionExpression: "#wall_id = :wall_id and #post_id = :post_id",
        ExpressionAttributeNames: {
            "#wall_id": "wall_id",
            "#post_id": "post_id"
        },
        ExpressionAttributeValues: {
            ":wall_id": postData.body.wall_id,
            ":post_id": postData.body.post_id
        }
    }


    db.query(params2, function(err, data) {
        console.log(err);
        var likeList = data.Items[0].like_list;
        console.log("UNLIKE: " + postData.body.unlike);

        if (postData.body.unlike === "true") {
            var index = likeList.indexOf(postData.body.user);
            likeList.splice(index, 1);
        } else {
            console.log("LIKELISt: " + likeList);
            likeList.push(postData.body.user);
        }

        console.log(likeList + " LIKE");
        var params = {
            TableName: "Posts",
            Key:{
                "post_id": postData.body.post_id,
                "wall_id": postData.body.wall_id
            },
            UpdateExpression: "set likes = :r, like_list= :l",
            ExpressionAttributeValues:{
                ":r":postData.body.like,
                ":l":likeList
            },
            ReturnValues:"UPDATED_NEW"
        };

        db.update(params, function(err, data) {
            if (err) {
                console.log(err);
            } else {
                callback(err, data);
            }
        })
    })



}

const getWall = function (username, callback) {
    console.log("OKAYYY");
    var postIdList = [];
    // Get posts for user
    var params = {
        TableName: "Posts",
        KeyConditionExpression: "#wall_id = :wall_id",
        ScanIndexForward: false,
        ExpressionAttributeNames: {
            "#wall_id": "wall_id",
        },
        ExpressionAttributeValues: {
            ":wall_id": username,
        }
    }
    console.log("USERNAME: " + username);

    var postsFinal = [];
    postsFinal.push(postIdList);
    postsFinal.push(username);
    var promises2 = [];
    var promises3 = [];
    db.query(params).promise().then(function(data3) {
        console.log(data3.Items);
        data3.Items.forEach(function(item, index) {
            if (item !== null) {
                var post = {
                    'content': item.content,
                    'creator': item.creator,
                    'receiver': item.receiver,
                    'date': item.date,
                    'type': item.type,
                    'post_id': item.post_id,
                    'parent': item.parent,
                    'like' : item.likes,
                    'wall_id': item.wall_id,
                    'creator_name': item.creator_name,
                    'receiver_name': item.receiver_name,
                    'like_list': item.like_list,
                    'children': []
                };

                var params2 = {
                    TableName: "Comments",
                    KeyConditionExpression: "#parent = :parent",
                    ExpressionAttributeNames: {
                        "#parent": "parent",
                    },
                    ExpressionAttributeValues: {
                        ":parent": post.post_id,
                    }
                }

                postIdList.push(item.post_id);
                promises2.push(new Promise ((resolve, reject) => {
                    db.query(params2, function(err, data) {
                        if (err) {
                            reject(new Error('Cannot query the table at this moment: ' + err));
                        } else {
                            console.log("Query succeeded.");
                            data.Items.forEach(function (item, index) {
                                var comment = {
                                    'content': item.content,
                                    'creator': item.creator,
                                    'receiver': item.receiver,
                                    'date': item.date,
                                    'type': item.type,
                                    'post_id': item.post_id,
                                    'parent': item.parent,
                                    'creator_name': item.creator_name,
                                    'children': []
                                };

                                var params3 = {
                                    TableName: "Comments",
                                    KeyConditionExpression: "#parent = :parent",
                                    ExpressionAttributeNames: {
                                        "#parent": "parent",
                                    },
                                    ExpressionAttributeValues: {
                                        ":parent": comment.post_id,
                                    }
                                }

                                promises3.push(new Promise ((resolve, reject) => {
                                    db.query(params3).promise().then(function(data) {
                                        data.Items.forEach(function (item, index) {
                                            var subcomment = {
                                                'content': item.content,
                                                'creator': item.creator,
                                                'receiver': item.receiver,
                                                'post_id': item.post_id,
                                                'parent': item.parent,
                                                'date': item.date,
                                                'creator_name': item.creator_name,
                                            }
                                            comment.children.push(subcomment);
                                            postsFinal[0].push(subcomment.post_id);
                                        })
                                        post.children.push(comment);
                                        postsFinal[0].push(comment.post_id);
                                        resolve(data);
                                    }).catch(function(err) {
                                        console.log(err);
                                        callback(err, null);
                                    });
                                }));

                            })
                            postsFinal.push(post);
                            resolve(data);
                        }
                    })
                }));
            }
        })
        Promise.all(promises2).then((values) => {
            Promise.all(promises3).then((values) => {
                postsFinal.sort(function(a,b){
                    return b.post_id - a.post_id;
                });
                callback(null, postsFinal);
                console.log("FINAL: " + JSON.stringify(postsFinal));
            }).catch(function(err) {
                console.log(err)
                callback(err, null);
            });

        }).catch(function(err) {
            console.log(err);
            callback(err, null);
        });
    }).catch(function(err) {
        console.log(err);
        callback(err, null);
    });
}

//unused code
//create new chatroom currently only for DMs
//name of chatroom is the sum of names
//schema is sender, timestamp, messages
const addChatRoom = function(name1, name2) {
    db1.createTable(params, function(err, data) {
        if (err) {
            console.log("chatroom table not created");
            console.log(err);
        } else {
            console.log('created chatroom table');
        }
    });
}
const chatroomCheck = function(person, callback) {
    var params = {
        TableName : name1 + "-" + name2 + "-chat",
        KeySchema : [
            {AttributeName : "sender", KeyType: "HASH"},
            {AttributeName : "timestamp", KeyType: "RANGE"}
        ],
        AttributeDefinitions : [
            {AttributeName : "sender", AttributeType: "S" },
            {AttributeName : "timestamp", AttributeType: "S" }
        ],
        ProvisionedThroughput : {
            ReadCapacityUnits : 5,
            WriteCapacityUnits : 5
        }
    };
}

//adds message items
//takes in the sender's name, the timestamp, the sent message
const addMessage = function(chatroomID, senderName, timeInfo, sentMsg, callback) {
    var params = {
        TableName: "Chat",
        Item : {
            'chatroomID' : chatroomID,
            'timestamp' : timeInfo,
            'message' : [senderName, timeInfo, sentMsg]
        }
    }
    db.put(params, function(err, data) {
        if (err) {
            console.log("adding new messages fail");
            console.log(err);
            callback(err, null);
        } else {
            console.log("Added item: ", JSON.stringify(data, null, 2));
            callback(err, data);
        }
    });
}
//chatlist update add
const appendchatlist = function(chatuser, newchat, callback) {
    var params = {
        TableName: "Users",
        Key : {"username" : chatuser},
        UpdateExpression : 'ADD #chatlist :c',
        ExpressionAttributeNames : {
            '#chatlist' : 'chatlist',
        },
        ExpressionAttributeValues : {
            ':c' : db.createSet([newchat])
        },
        ReturnValues: 'ALL_NEW'
    }
    db.update(params, function(err, data){
        if (err) {
            console.log("update chatlist error from db");
            callback(err);
        } else {
            console.log("update chatlist succeeded from db");
            callback(null, data);
        }
    });
}
//chatlist delete
//remove left chat
const removechatfromlist = function(chatuser, chatToDelete, callback) {
    var params = {
        TableName: "Users",
        Key : {"username" : chatuser},
        UpdateExpression : 'DELETE #chatlist :c',
        ExpressionAttributeNames : {
            '#chatlist' : 'chatlist',
        },
        ExpressionAttributeValues : {
            ':c' : db.createSet([chatToDelete])
        },
        ReturnValues: 'ALL_NEW'
    }
    db.update(params, function(err, data){
        if (err) {
            console.log("remove chatlist error from db");
            callback(err);
        } else {
            console.log("remove chatlist succeeded from db");
            callback(null, data);
        }
    });

}
//look up and scans through the given chatroom
const msgHistory = function(roomID, callback) {
    var params = {
        TableName: "Chat",
        KeyConditionExpression: "#roomID = :chatroomID",
        ExpressionAttributeNames: {
            "#roomID": "chatroomID",
        },
        ExpressionAttributeValues: {
            ":chatroomID": roomID,
        },
        ScanIndexForward: "true",
        Select: "ALL_ATTRIBUTES"
    }
    db.query(params, function (err, data) {
        if (err || data.Items.length == 0) {
            console.log("query error");
            callback(err);
        } else {
            console.log("query success");
            callback(null, data);
        }
    });
}
//get chatlist
const getchatlist = function(user, callback) {
    var params = {
        TableName: "Users",
        Key : {
            "username": user,
        },
        ProjectionExpression : "chatlist"
    }
    db.get(params, function(err, data) {
        //|| data.Items.length == 0
        if (err) {
            console.log("chatlist query error db");
            console.log(err);
            callback(err);
        } else {
            console.log("chatlist query success db");
            callback(null, data);
        }
    });
}
//adds friend request
const addSentRequests = function(sender, receiver, callback) {
  var queryParams = {
      TableName: "Users",
      KeyConditionExpression: "#user = :receiver",
      ExpressionAttributeNames: {
          "#user": "username",
      },
      ExpressionAttributeValues: {
          ":receiver": receiver,
      }
  }

  db.query(queryParams, function(err, data) {
      if (err || data.Items.length == 0) {
          console.log(err);
          callback(err, null);
      }
      else {
        console.log(data.Items[0].name);
        var senderParams = {
          TableName: 'Users',
          Key: { "username": sender },
          ReturnValues: 'ALL_NEW',
          UpdateExpression: "SET sent_requests.#receiver = :name",
          ExpressionAttributeNames: { "#receiver" : receiver },
          ExpressionAttributeValues: { ":name" : data.Items[0].name },
          ConditionExpression: "attribute_not_exists(sent_requests.#receiver) AND attribute_exists(sent_requests)",
        }

        db.update(senderParams, function(err, data) {
            if (err) {
              var senderParams2 = {
                TableName: 'Users',
                Key: { "username": sender },
                ReturnValues: 'ALL_NEW',
                UpdateExpression: "SET sent_requests = :m",
                ExpressionAttributeValues: { ":m" : {} },
                ConditionExpression: "attribute_not_exists(sent_requests)"
              }

              db.update(senderParams2, function(err, data) {
                if (err) {
                  callback(err);
                } else {
                  db.update(senderParams, function(err, data) {
                    if (err) {
                      callback(err);
                    } else {
                      callback(false);
                    }
                  });
                }
              });
            } else {
                callback(false);
            }
        });
      }
  });
}

const addReceivedRequests = function(sender, receiver, callback) {
  var queryParams = {
      TableName: "Users",
      KeyConditionExpression: "#user = :sender",
      ExpressionAttributeNames: {
          "#user": "username",
      },
      ExpressionAttributeValues: {
          ":sender": sender,
      }
  }

  db.query(queryParams, function(err, data) {
      if (err || data.Items.length == 0) {
          console.log(err);
          callback(err, null);
      }
      else {
        var senderParams = {
          TableName: 'Users',
          Key: { "username": receiver },
          ReturnValues: 'ALL_NEW',
          UpdateExpression: "SET received_requests.#sender = :name",
          ExpressionAttributeNames: { "#sender" : sender },
          ExpressionAttributeValues: { ":name" : data.Items[0].name },
          ConditionExpression: "attribute_not_exists(received_requests.#sender) AND attribute_exists(received_requests)",
        }

        db.update(senderParams, function(err, data) {
            if (err) {
              var senderParams2 = {
                TableName: 'Users',
                Key: { "username": receiver },
                ReturnValues: 'ALL_NEW',
                UpdateExpression: "SET received_requests = :m",
                ExpressionAttributeValues: { ":m" : {} },
                ConditionExpression: "attribute_not_exists(received_requests)"
              }

              db.update(senderParams2, function(err, data) {
                if (err) {
                  callback(err);
                } else {
                  db.update(senderParams, function(err, data) {
                    if (err) {
                      callback(err);
                    } else {
                      callback(false);
                    }
                  });
                }
              });
            } else {
                callback(false);
            }
        });
      }
  });
}

const deleteSentRequest = function(sender, receiver, callback) {
    var userParams = {
      TableName: 'Users',
      Key: { "username": sender },
      ReturnValues: 'ALL_NEW',
      UpdateExpression: "REMOVE sent_requests.#receiver",
      ExpressionAttributeNames: { "#receiver" : receiver },
      ConditionExpression: "attribute_exists(sent_requests.#receiver) AND attribute_exists(sent_requests)",
    }

    db.update(userParams, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(false);
        }
    });
  }

  const deleteReceivedRequest = function(sender, receiver, callback) {
    var userParams = {
      TableName: 'Users',
      Key: { "username": receiver },
      ReturnValues: 'ALL_NEW',
      UpdateExpression: "REMOVE received_requests.#sender",
      ExpressionAttributeNames: { "#sender" : sender },
      ConditionExpression: "attribute_exists(received_requests.#sender) AND attribute_exists(received_requests)",
    }

    db.update(userParams, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(false);
        }
    });
  }

const addFriend = function(user, friend, callback) {
    var lookupParams = {
        TableName: "Users",
        KeyConditionExpression: "#user = :username",
        ExpressionAttributeNames: {
            "#user": "username",
        },
        ExpressionAttributeValues: {
            ":username": friend,
        }
    }

    db.query(lookupParams, function(err, data) {
        if (err || data.Items.length == 0) {
            console.log(err);
            callback(err);
        }
        else {
            var map = {"name": data.Items[0].name, "affiliation": data.Items[0].affiliation, "ppic": data.Items[0].profileURL};

          var userParams = {
            TableName: 'Users',
            Key: { "username": user },
            ReturnValues: 'ALL_NEW',
            UpdateExpression: "SET friends.#friend = :name",
            ExpressionAttributeNames: { "#friend" : friend },
            ExpressionAttributeValues: { ":name" : map },
            ConditionExpression: "attribute_not_exists(friends.#friend) AND attribute_exists(friends)",
          }

          db.update(userParams, function(err, data) {
              if (err) {
                var userParams2 = {
                  TableName: 'Users',
                  Key: { "username": user },
                  ReturnValues: 'ALL_NEW',
                  UpdateExpression: "SET friends = :m",
                  ExpressionAttributeValues: { ":m" : {} },
                  ConditionExpression: "attribute_not_exists(friends)"
                }

                db.update(userParams2, function(err, data) {
                  if (err) {
                    callback(err);
                  } else {
                    db.update(userParams, function(err, data) {
                      if (err) {
                        callback(err);
                      } else {
                        callback(false);
                      }
                    });
                  }
                });
              } else {
                  callback(false);
              }
          });
        }
    });
  }

const unfriend = function(user, friend, callback) {
  var userParams = {
    TableName: 'Users',
    Key: { "username": user },
    ReturnValues: 'ALL_NEW',
    UpdateExpression: "REMOVE friends.#friend",
    ExpressionAttributeNames: { "#friend" : friend },
    ConditionExpression: "attribute_exists(friends.#friend) AND attribute_exists(friends)",
  }

  db.update(userParams, function(err, data) {
      if (err) {
          callback(err);
      } else {
          callback(false);
      }
  });
}

const allUsers = function(callback) {
    var params = {
        TableName: "Users"
    }
    console.log("scanning table");

    db.scan(params, function(err, data) {
        if (err) {
            console.log(err);
            callback(err, null);
        }
        else {
            callback(null, data);
        }
    })
}

const indexNews = async (callback) => {
    let ts = new Date();
    var offset = -300; //Timezone offset for EST in minutes.
    var est = new Date(ts.getTime() + offset*60*1000);
    console.log('indexing news starting now');
    // prints date & time in YYYY-MM-DD format of today's date
    let date = est.toISOString().slice(0,10)
    console.log(date);
    var params = {
        TableName: "newsData",
        IndexName: "open-date-index",
        KeyConditionExpression: "#open = :open and #d <= :date",
        ExpressionAttributeNames: {
            "#d": "date",
            "#open": "open"
        },
        ExpressionAttributeValues: {
            ":date": date,
            ":open": "true"
        }
    }
    //recursively concats all remaining elements in batches since query limite by 1 MB calls
    const _getAllData = async (params, startKey) => {
        if (startKey) {
          params.ExclusiveStartKey = startKey
        }
        return db.query(params).promise()
      }
      let lastEvaluatedKey = null
      let rows = []
      do {
        const result = await _getAllData(params, lastEvaluatedKey)
        rows = rows.concat(result.Items)
        lastEvaluatedKey = result.LastEvaluatedKey
      } while (lastEvaluatedKey)
      var string = "";
      rows.forEach(item => {
        string = item.category.replace(/ /g, '') + " " + item.id + " " + item.date + "\n" + string;
      });
    fs.writeFileSync("categoryArticles.txt", string);
    console.log('finished writing to indexData');
    callback(rows);
}

const indexArticles = function(callback) {
    var params = {
        TableName: "Posts",
        IndexName: "type-index",
        KeyConditionExpression: "#type = :type",
        ExpressionAttributeNames: {
            "#type": "type",
        },
        ExpressionAttributeValues: {
            ":type": "news",
        }
    }

    db.query(params, function(err, data) {
        if (err) {
            console.log(err);
            console.log("in indexArticles");
        }
        else {
            var string = "";
            console.log('indexing articles');
            let itemSet = new Set();
            data.Items.forEach(item => {
                item.like_list.forEach(a => {
                    itemSet.add(a + " " + JSON.parse(item.content).id);
                })
            });
            itemSet.forEach(i => {
                string = i + "\n" + string;
            })
            fs.writeFileSync("userArticles.txt", string);
            callback(data);
        }
    });
}

const indexUsers = function(callback) {
    var params = {
        TableName: "Users",
    }
    db.scan(params, function(err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }
        else {
            console.log("success");
            var stringCat = "";
            var stringFriends = "";

            data.Items.forEach(item => {
                item.interests.forEach(a => {
                     stringCat = item.username + " " + a.replace(/ /g, '') + "\n" + stringCat;
                })
            });
            fs.writeFileSync("userCategories.txt", stringCat);

            data.Items.forEach(item => {
                if (item) {
                    Object.keys(item.friends).forEach(f => {
                        stringFriends = item.username + " " + f + "\n" + stringFriends;
                    })
                }
            });
            fs.writeFileSync("userFriends.txt", stringFriends);
            callback(data);
        }
    });
}

const storePrefix = function (prefix, username, name) {
    var params = {
        TableName: "SearchBar",
        Item: {
            'prefix': prefix,
            'username': username,
            'fullname': name
        }
    }

    db.put(params, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {

        }
    });
}

const getPrefixResult = function(prefix, callback) {
    console.log("PREFIX: " + prefix);
    prefix.toLowerCase();
    var params = {
        TableName: "SearchBar",
        KeyConditionExpression: "#prefix = :prefix",
        ExpressionAttributeNames: {
            "#prefix": "prefix",
        },
        ExpressionAttributeValues: {
            ":prefix": prefix,
        }
    }

    db.query(params, function(err, data) {
        if (err) {
            callback(err, null);
        } else {
            console.log("Query succeeded.");
            console.log("results: " + JSON.stringify(data));
            callback(err, data.Items);
        }
    })
}

var database = {
    indexNews: indexNews,
    indexUsers: indexUsers,
    allUsers: allUsers,
    profile: profileInfo,
    profileLookup: profileLookup,
    publicProfileUpdate: publicProfileUpate,
    privateProfileUpdate: privateProfileUpdate,
    loginLookup: loginLookup,
    posts: getPosts,
    getNewsData: getNewsData,
    getchatlist: getchatlist,
    checkchatroom: chatroomCheck,
    addFriend: addFriend,
    addchatroom : addChatRoom ,
    addmessage : addMessage,
    msghistory : msgHistory,
    addchatlist : appendchatlist,
    removechatlist : removechatfromlist,
    addSentRequests: addSentRequests,
    addReceivedRequests: addReceivedRequests,
    deleteSentRequest: deleteSentRequest,
    deleteReceivedRequest: deleteReceivedRequest,
    addFriend: addFriend,
    unfriend: unfriend,
    getNewsDist: getNewsDist,
    getNews: getNews,
    updateSeen: updateSeen,
    deleteArticle: deleteArticle,
    addPost: addPost,
    deletePost: deletePost,
    getWall: getWall,
    profilePic: profilePic,
    addNewsPost: addNewsPost,
    getNewsToday: getNewsToday,
    updateLikes: updateLikes,
    articleLikes: articleLikes,
    getOnePost: getOnePost,
    indexArticles: indexArticles,
    picturePost: picturePost,
    storePrefix: storePrefix,
    getPrefixResult: getPrefixResult,
    imagePost: imagePost,
    updateOnline: updateOnline,
    deleteOnline: deleteOnline,
    getOnline: getOnline,
    friendPost: friendPost,
    updateFriendsAffiliation: updateFriendsAffiliation,
    updateFriendsPic: updateFriendsPic
};

module.exports = database;
