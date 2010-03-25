Spawn is a simple multiprocessing task queue.

It has two main paths:

- exec: takes a list of commands, and executes up to NUM\_CORES at a time.
- manage: takes a single command that supports spawn's message-passing protocol,
  and dispatches tasks, waiting for finish signals to send another task.

Weaknesses: NUM\_CORES is hard-coded, and currently defaults to 16.

Example:

    #js
    // manager.js
    var spawn = require("spawn");
    spawn.manage("my-command.js", ["a", "b", "c"], function(message){
      sys.puts(message);
    })(function(){
      sys.puts("Finished.");
    });
    
    // my-command.js
    spawn.receive(function(message, done){
      done("Result: " + message);
    });
    
    // will output
    Result: a
    Result: b
    Result: c
    Finished.
    
    // or, given that it is not guaranteed which process finishes first:
    Result: b
    result: c
    Result: a

