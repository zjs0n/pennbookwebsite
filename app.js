var express = require('express');
var routes = require('./routes/routes.js');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var serveStatic = require('serve-static');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var app = express();
app.use(express.urlencoded());
app.use(cookieParser());
app.use(session({secret: 'secret', saveUninitialized: true}));

//chat
const path=require("path");
var http = require("http").createServer(app);
var io = require('socket.io')(http);
app.use(express.static(path.join(__dirname, "public")));

//check if socket is connected
io.on('connection', (socket) => {
    console.log('a user connected');
});
//server check
io.on('connection', (socket) => {
    socket.on('chat message', (msg) => {
        console.log('message was ' + msg.msgtext);
    });
});
var curr;
//all socket calls
io.on('connection', (socket) => {
    socket.on('currentUser', txt => {
        console.log("THIS IS CURRENT USER: " + txt.currentUser);
        curr = txt.currentUser;
    });
    //chat invite
    socket.on('chat invite', (invite) =>{
        console.log("THIS IS INVITE: " + invite.chatroom);
        io.emit('chat invite', invite); 
    });
    //group chat invite
    socket.on('group chat invite', (invite) =>{
        io.emit('group chat invite', invite);
    });
    socket.on('accept invite', (invite) =>{
        io.emit('accept invite', invite);
    });
    socket.on('accept group invite', (invite) =>{
        io.emit('accept group invite', invite);
    })
    socket.on('deny invite', (invite) => {
        io.emit('deny invite', invite);
    });
    socket.on('chat message', (msg) => {
      io.to(msg.chatroom).emit('chat message', msg);
    });
    socket.on("join room", obj => {
        socket.join(obj.chatroom);
    });
    socket.on("leave room", obj => {
        socket.leave(obj.chatroom);
        io.emit('leave chat', obj);
    });
    socket.on('refresh chat list', (obj) => {
        io.emit('refresh chat list', obj);
    })
  });

//route to load the main page if session token identified otherwise loads the home page
app.get('/', routes.getHome);
app.get('/updateHome', routes.friendsLookup);
app.get('/register', routes.getRegistration);
//app.get('/wall/:username', routes.getWall);
app.get('/wall/:name', routes.getWall);
app.get('/showWall/user/:username', routes.showWall);
//route to create the account and route to main page as logged in user
app.post('/createaccount', routes.createAccount);
app.get('/allusers', routes.getAllUsers);
//posts to the database login information
app.post('/login', routes.loginCheck);
//destroys session data and logs user out
app.get('/logout', routes.logout);
//sends data from the Posts table
app.get('/getPosts', routes.showPosts);
//gets the search results from newsfeed
app.post('/article', routes.getArticle);
app.post('/articleImages', routes.articleImages);
//go to the news search area
app.get('/news', routes.getNews);
//go to friend visualizer
app.get('/friends', routes.getVisualizer);
//send friend request
//app.post('/addfriend', routes.addFriend);

//send current login data
app.get('/currentlogindata', routes.getcurrentlogin);
//get current login person
app.post('/currentlogindata', routes.getcurrentlogin);
//testing creating table
//app.get('/join', routes.addchatroom);
//app.post('/join', routes.addchatroom);
//adding messages
app.get('/newmessage', routes.addchatmessages);
app.post('/newmessage', routes.addchatmessages);
//output the sorted message table
app.get('/output', routes.chathistorysearch);
app.post('/output', routes.chathistorysearch);
app.get('/currentchats', routes.chatlistsearch);
app.post('/currentchats', routes.chatlistsearch);
//chatting window
app.get('/chat', routes.getchat);
//chatlist updating
app.get('/addchatlist', routes.addtochatlist);
app.post('/addchatlist', routes.addtochatlist);
//chatlist for single invite
app.get("/addchatlistsingle", routes.addtochatlistsingle);
app.post("/addchatlistsingle", routes.addtochatlistsingle);
//chatlist updating for removing
app.get('/removechatlist', routes.removechatroom);
app.post('/removechatlist', routes.removechatroom);
//get current chatting room invite room
app.get('/invitechattingID', routes.getchatid);
app.post('/invitechattingID', routes.getchatid);
//app.post('/chat', routes.getchat);
//app.post('/addfriend', routes.addFriend);
//app.post('/addpost', routes.addPost);

app.post('/sendrequest', routes.sendRequest);
app.post('/deleterequest', routes.deleteRequest);
//add users to each others' friend lists
app.post('/addfriend', routes.addFriend);
//delete users from each others' friend lists
app.post('/unfriend', routes.unfriend);
//gets the distribution of news articles for the user
app.get('/indexusers', routes.indexUsers);
app.get('/indexnews', routes.indexNews);
app.post('/addpost', routes.addPost);
//post profile pic to s3 bucket
app.post('/profilepic', routes.upload, routes.profilePic);
app.get('/getprofile', routes.myprofile);
app.post('/getprofile', routes.myprofile); //get the current user info
app.get('/getProfile/:id', routes.profileLookup);
//app.get('/livy', routes.spawnAdsorption);
//app.get('/spawn', routes.timeLivy);
//post to db the updated profile information
app.post('/publicupdate', routes.publicUpdate);
app.post('/privateupdate', routes.privateUpdate);
app.get('/getNewsToday', routes.getNewsToday);
//sends friend post
app.post('/friendpost', routes.friendPost);
//tracks likes of articles
app.post('/articleLikes', routes.articleLikes);
app.post('/addprofilepost', routes.addProfilePost);
// get search suggestion
app.get('/searchSuggestion/:prefix', routes.getSuggestion);
app.post('/imagepost', routes.upload, routes.imagePost);
//for visualizer
app.use(bodyParser.urlencoded({ extended: false }));
app.use(morgan('combined'));
app.use(cookieParser());
app.use(session({secret: "secretSession"}));
app.use(serveStatic(path.join(__dirname, 'public')));

//load initial graph of direct friends
app.get('/friendvisualization', routes.visualizeFriends);
//expand graph to include friends of friends with same affiliation
app.get('/getFriends/:user/:school', routes.expandFriends);
//runs livy job every 5 min with a call from server side
//routes.timeLivy();

//gets all current online users
app.get('/onlineusers', routes.onlineUsers);

//get full name
app.get('/getfullname', routes.getfullname);
app.post('/getfullname', routes.getfullname);
http.listen(8080);

console.log('Server running on port 8080');
