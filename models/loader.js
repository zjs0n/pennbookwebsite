var AWS = require('aws-sdk');
AWS.config.update({region:'us-east-1'});
var db = new AWS.DynamoDB();
var async = require('async');


/* The function below checks whether a table with the above name exists, and if not,
   it creates such a table with a hashkey called 'name' and sort key called 'username, which is a string. */

function createUsers() {
    var params = {
        TableName : "Users",
        KeySchema: [
            { AttributeName: "username", KeyType: "HASH" }
        ],
        AttributeDefinitions: [
            { AttributeName: "username", AttributeType: "S" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    db.createTable(params, function(err, data) {
        if (err) {
            console.log("failed to create table for user");
            console.log(err);
        } else {
            console.log('created table');
        }
    });
}

function createPosts() {
	var params = {
        TableName : "Posts",
        KeySchema: [
            { AttributeName: "wall_id", KeyType: "HASH"},
            { AttributeName: "post_id", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "wall_id", AttributeType: "S" },
            { AttributeName: "post_id", AttributeType: "S" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

	db.createTable(params, function(err, data) {
        if (err) {
            console.log("failed to create table");
        } else {
            console.log('created table');
        }
    });
}

function addChatTable () {
    var params = {
        TableName : "Chat",
        KeySchema : [
            {AttributeName : "chatroomID", KeyType: "HASH"},
            {AttributeName : "timestamp", KeyType: "RANGE"}
        ],
        AttributeDefinitions : [
            {AttributeName : "chatroomID", AttributeType: "S" },
            {AttributeName : "timestamp", AttributeType: "S" }
        ],
        ProvisionedThroughput : {
            ReadCapacityUnits : 5,
            WriteCapacityUnits : 5
        }
    };
    db.createTable(params, function(err, data) {
        if (err) {
            console.log("failed to create Chat table");
        } else {
            console.log("chat table created");
        }
    });
}

function createComments() {
    var params = {
        TableName : "Comments",
        KeySchema: [
            { AttributeName: "parent", KeyType: "HASH"},
            { AttributeName: "post_id", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "parent", AttributeType: "S" },
            { AttributeName: "post_id", AttributeType: "S" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    db.createTable(params, function(err, data) {
        if (err) {
            console.log("failed to create table");
        } else {
            console.log('created table');
        }
    });
}

function createSearchBar() {
    var params = {
        TableName : "SearchBar",
        KeySchema: [
            { AttributeName: "prefix", KeyType: "HASH"},
            { AttributeName: "username", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "prefix", AttributeType: "S" },
            { AttributeName: "username", AttributeType: "S" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    db.createTable(params, function(err, data) {
        if (err) {
            console.log("failed to create table");
        } else {
            console.log('created table');
        }
    });
}

addChatTable();
createUsers();
createPosts();
createComments();
createSearchBar();

