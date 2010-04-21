/*global process*/
var sys = require("sys"), spawnProcess = require('child_process').spawn;
var mp = exports;

// constants
mp.NUM_CORES = 16;

mp.exec = function(queue, responder) {
  var len ;
  
  // if params are strings, make into an array 
  if ('string' === typeof queue) {
    queue = Array.prototype.slice.call(arguments);
    responder = null;
  }
  
  return function(done) {
    var running_count = 0;
    
    // processes the queue
    var process_queue = function() {
      while (running_count < mp.NUM_CORES && queue.length > 0) run_first();
      if (running_count === 0 && queue.length === 0) {
        done();
      }
    };
    
    // runs the first item in the queue
    var run_first = function(){
      var entry = queue.shift();
      running_count ++;
      var result = sys.exec(entry, function(err, stdout, stderr) {
        try {
          if (responder) responder(err, stdout, stderr);
        } catch (e) {
          sys.puts("Error in responder: " + entry);
        }
        running_count--;
        process_queue();
      });
    };
    
    process_queue();
  };
};

mp.receive = function(receiver) {
  var stdin = process.openStdin();
  stdin.setEncoding('utf8');
    
  function done(result) {
    process.stdout.write(JSON.stringify({
      path: "finish",
      message: result
    }));
  }
  
  stdin.addListener("data", function(data){
    var message = JSON.parse(data);
    
    if (message.path == "tasks") {
      try{
        receiver(message.message, done);
      } catch (e) {
        process.stdout.write(JSON.stringify({
          path: "finish",
          message: e.toString()
        }));
      }
    }
  });
};

mp.manage = function(command, args, queue, responder) {
  // first
  if (!responder) {
    responder = queue;
    queue = args;
    args = [];
  }
  
  // whoops? Ok, make it blank
  if (!responder) {
    responder = function() { };
  }
  
  var OUTPUT = "OUT", ERROR = "ERR";
  
  return function(done) {
    // handle empty queue
    if (queue.length === 0) {
      done();
      return;
    }
    
    // as you were...
    var launchCount = Math.min(mp.NUM_CORES, queue.length);
  
    function assignNext(worker) {
      // first, cancel the worker if needed
      if (queue.length === 0) {
        worker.stdin.end();
        
        launchCount--;
        if (launchCount === 0) {
          done();
        }
        return;
      }
    
      // now, pop from queue and start.
      var next = queue.shift();
      worker.stdin.write(JSON.stringify({
        "path": "tasks",
        "message": next
      }));
    }
  
    function workerMessage(type, worker, message) {
      message = message.toString();
      if (type === OUTPUT) {
        // send to responder
        message = JSON.parse(message);
        responder(message.message);
        
        if (message.path !== "finish") return; // can't assign next until on "finish" path.
      } else if (type === ERROR) {
        // well, send the error
        responder({ error: true, message: message });
        sys.puts(message);
      
        // but we can go ahead and assign another.
      }
      assignNext(worker);
    }
  
    function createHandler(t, w) { return function(data) {
      workerMessage(t, w, data);
    }; }
  
    // start workers. By the way, I used to be king of message passing.
    var workers = [];
    var i;
    for (i = 0; i < launchCount; i++) {
      var worker = spawnProcess(command, args);
      worker.stdout.addListener("data", createHandler(OUTPUT, worker));
      worker.stderr.addListener("data", createHandler(ERROR, worker));
    
      workers.push(worker);
    }
    
    for (i = 0; i < launchCount; i++) assignNext(workers[i]);
  };
};