var wrapper;
var inputBox;
var dropBox;
 //keeps track of the users online in the previous refresh
 var oldArray = [];
 //keeps track of the previous friends from the prior refresh
 var oldFriends = [];

function searchAction() {
  var x = document.getElementById("searchbar2").value;
  if (x !== "") {
    $.getJSON("/searchSuggestion/" + x, function( items ) {
          let searchResults = items;

          searchResults = searchResults.map((result)=>{
               return result = `<li id=${result.username}>${result.fullname}</li>`;
           });
           wrapper.classList.add("active");
           showDropdown(searchResults);
           var list = dropBox.querySelectorAll("li");
           for (var i = 0; i < list.length; i++) {
               list[i].setAttribute("onclick", "select(this)");
           }
       });
      console.log(x);
  } else {
     wrapper.classList.remove("active");
  }
}

function select(element){
    var userData = element.textContent;
    console.log("ID:" + element.id);
    inputBox.value = userData;
    var urlLink = "/wall/";
       if (userData === "") {
            alert("Please enter a name!");
       } else {
            urlLink = urlLink + element.id;
            $('#searchUser').attr('action', urlLink);
       }
    wrapper.classList.remove("active");
}

function showDropdown(list){
    var data;
    if(!list.length){
        let userValue = inputBox.value;
        data = '<li>'+ userValue +'</li>';
    }else{
        data = list.join('');
    }
    dropBox.innerHTML = data;
}

var updateHome = function() {
  var loadUserID = "<%= curr %>";
  $.get('/updateHome', function(data) {
      var data = JSON.parse(data);
      var friends = data.data.friends;
      var requests = data.data.received_requests;

      var friendReqs = document.getElementById("requestsList");
      while (friendReqs.firstChild) {
        friendReqs.removeChild(friendReqs.firstChild);
      }
      if (requests === undefined || Object.keys(requests).length == 0) {
        friendReqs.innerHTML='<li class="list-group-item"><p class="text-secondary">No pending friend requests</p></li>'
      } else {
        Object.keys(requests).forEach(request => {
          var requestItem = document.createElement("li");
          requestItem.innerHTML = requests[request] + '<button class="acceptRequest btn btn-outline-primary btn-sm btn-block" name="'
            + request + '">Accept</a><button class="denyRequest btn btn-outline-danger btn-sm btn-block" name="'
            + request + '">Deny</a>';
          requestItem.className = "list-group-item";
          requestItem.id = request + "-friend-request";
          friendReqs.appendChild(requestItem);
        });
      }

      $.get('/onlineusers', function(data) {
        let info = JSON.parse(data).info; 
        console.log(info);
        var diff1 = info.filter(x => !oldArray.includes(x));
        var diff2 = oldArray.filter(x => !info.includes(x));
        var diff3 = oldFriends.filter(x => !Object.keys(friends).includes(x));
        var diff4 = Object.keys(friends).filter(x => !oldFriends.includes(x));
        console.log(diff3);
        console.log(diff4);

        if (diff1.length > 0 || diff2.length > 0 || diff3.length > 0 || diff4.length > 0) {
          var friendsDiv = document.getElementById("friendsList");
          while (friendsDiv.firstChild) {
            friendsDiv.removeChild(friendsDiv.firstChild);
          }
          if (friends === undefined || Object.keys(friends).length == 0) {
            friendsDiv.innerHTML='<li class="list-group-item"><p class="text-secondary">No friends</p></li>'
          } else {
            Object.keys(friends).forEach(friend => {
              console.log('friends are');
              console.log(friends);
              var friendItem = document.createElement("li");
              var proPic = document.createElement("img");
              proPic.className = `icon pic${friend}`;
              friendItem.appendChild(proPic);
              if (data.includes(friend)) {
                friendItem.innerHTML += '<div class="online bg-success"></div>' + friends[friend].name;
              } else {
                friendItem.innerHTML += friends[friend].name;
              }
              friendItem.className = "list-group-item";
              friendItem.id = friend;
              friendsDiv.appendChild(friendItem);
            });

          }
        }
        oldArray = info;
        oldFriends = Object.keys(friends);
      })

      var profileURL = "";
      $.get("/allusers", function(data) {
        data = JSON.parse(data).data;
        data.forEach(item => {
            profileURL = item.profileURL;
            var elements = document.getElementsByClassName(`pic${item.username}`);
            for (var i = 0; i < elements.length; i++) {
                elements.item(i).src = profileURL;
            }
          });
      });

  });
  setTimeout(updateHome, 2000);
}

$(document).ready(function() {
  wrapper = document.querySelector(".search");
  inputBox = wrapper.querySelector("input");
  dropBox = wrapper.querySelector(".dropdown");

  $.getJSON('/friendvisualization', function (json) {
      console.log(json);
      var affiliation = json.data;
      console.log(affiliation);
      var infovis = document.getElementById('infovis');
      var w = infovis.offsetWidth - 50, h = infovis.offsetHeight - 50;

      //init Hypertree
      var ht = new $jit.Hypertree({
        //id of the visualization container
        injectInto: 'infovis',
        //canvas width and height
        width: w,
        height: h,
        //Change node and edge styles such as
        //color, width and dimensions.
        Node: {
            //overridable: true,
            'transform': false,
            color: "#f00"
        },

        Edge: {
            //overridable: true,
            color: "#088"
        },
        //calculate nodes offset
        offset: 0.2,
        //Change the animation transition type
        transition: $jit.Trans.Back.easeOut,
        //animation duration (in milliseconds)
        duration:1000,
        //Attach event handlers and add text to the
        //labels. This method is only triggered on label
        //creation

        onCreateLabel: function(domElement, node){
            domElement.innerHTML = node.name;
            domElement.style.cursor = "pointer";
            domElement.onclick = function() {
                $.getJSON('/getFriends/'+node.id+'/'+affiliation, function(json) {
                    ht.op.sum(json, {
                        type: "fade:seq",
                        fps: 30,
                        duration: 1000,
                        hideLabels: false,
                        onComplete: function(){
                            console.log("New nodes added!");
                        }
                    });
                });
            }
        },
        //Change node styles when labels are placed
        //or moved.
        onPlaceLabel: function(domElement, node){
                var width = domElement.offsetWidth;
                var intX = parseInt(domElement.style.left);
                intX -= width / 2;
                domElement.style.left = intX + 'px';
        },

        onComplete: function(){
        }
      });
      //load JSON data.
      ht.loadJSON(json);
      //compute positions and plot.
      ht.refresh();
      //end
      ht.controller.onBeforeCompute(ht.graph.getNode(ht.root));
      ht.controller.onAfterCompute();
      ht.controller.onComplete();
    });

    updateHome();
});
