/**
 * Copyright 2020 Bart Butenaers & Kevin Godell
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    var settings = RED.settings;
    const fs     = require('fs');
    
    // -------------------------------------------------------------------------------------------------
    // Determining the path to the files in the dependent hls.js module once.
    // See https://discourse.nodered.org/t/use-files-from-dependent-npm-module/17978/5?u=bartbutenaers
    // -------------------------------------------------------------------------------------------------
    var hlsJsPath = require.resolve("hls.js");

    if (!fs.existsSync(hlsJsPath)) {
        console.log("Javascript file " + hlsJsPath + " does not exist");
        hlsJsPath = null;
    }

    function HTML(config) { 
        var width;
        var height;
        var videoPart;

        // The configuration is a Javascript object, which needs to be converted to a JSON string
        var configAsJson = JSON.stringify(config);
        
        // TODO rewrite this part based on css (https://stackoverflow.com/a/14422136)
        switch (config.aspectratio) {
            case "fit":
                // Keep the aspect ratio and leave the remaining svg area empty.
                width = "auto";
                height = "100%"; // stretchy
                break;
            case "crop":
                // Keep the aspect ratio and crop part of the image, to fit it in the shortest dimension.
                width = "100%"; // stretchx
                height = "auto";
                break;
            case "stretch":
                // Don't keep the aspect ratio, i.e. stretch the image in both directions to fit the entire svg area
                width = "100%";
                height = "100%";
                break;
        }
        
        var sourceStyle = "z-index:1; position: relative; width: " + width + "; height: " + height + "; max-width: none; max-height: none; top: 50%; transform: translateY(-50%);";
        
        // Parent div container.
        // Set height to 'auto' (instead of 100%) because otherwise you will get a vertical scrollbar: reason is that the height or width of the element, are
        // the first thing that will be calculated. Only afterwards the margins and paddings are added. So if you have an element with a height of 100% and top
        // and bottom margins (applied by the Node-RED parent elements) of 10 pixels each, there will be a scroll bar for the extra 20 pixels.
        // See more detail on https://www.lifewire.com/set-height-html-element-100-percent-3467075.
        // Set the video muted, to avoid "play() failed because the user didn't interact with the document first" ...
        var html = String.raw`<script src= "ui_mp4_player/hls.js"></script>
                              <div style="width: 100%; height: 100%; overflow: hidden; border: 1px solid black;" ng-init='init(` + configAsJson + `)'>
                                <video id="mp4_player_video_` + config.id + `" style="` + sourceStyle + `" muted>
                                    <p>Your browser does not support the HTML5 Video element.</p>
                                </video>
                                <svg id="mp4_player_svg_` + config.id + `" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="position: absolute; z-index: 2; left: 0px; top: 0px; width: 100%; height: 100%;">       
                                </svg>
                              </div>`;
        return html;
    }

    function checkConfig(node, conf) {
        if (!conf || !conf.hasOwnProperty("group")) {
            node.error(RED._("ui_my-little-ui-node.error.no-group"));
            return false;
        }
        return true;
    }

    var ui = undefined;
    
    function Mp4PlayerNode(config) {
        try {
            var node = this;
            if(ui === undefined) {
                ui = RED.require("node-red-dashboard")(RED);
            }
            RED.nodes.createNode(this, config);

            if (checkConfig(node, config)) { 
                var html = HTML(config);
                var done = ui.addWidget({
                    node: node,
                    group: config.group,
                    order: config.order,
                    width: config.width,
                    height: config.height,
                    format: html,
                    templateScope: "local",
                    emitOnlyNewValues: false,
                    forwardInputMessages: false,
                    storeFrontEndInputAsState: false,
                    convertBack: function (value) {
                        return value;
                    },
                    beforeEmit: function(msg, value) {
                        return { msg: msg };
                    },
                    beforeSend: function (msg, orig) {
                        if (orig) {
                            return orig.msg;
                        }
                    },
                    initController: function($scope, events) {
                        // Remark: all client-side functions should be added here!  
                        // If added above, it will be server-side functions which are not available at the client-side ...
                        
                        $scope.flag = true;
                
                        $scope.init = function (config) {
                            $scope.config = config;
                            
                            // TODO moeten we wel de images als (base) encoded string doorgeven, of kunnen we gewoon een binary doorgeven?
                            // TODO moeten we iets voorzien om intern base te maken?  En moet dat automatisch gedetecteerd worden, of ergens manueel aanvinken?
                            
                            $scope.videoElement = document.getElementById("mp4_player_video_" + config.id);
                            $scope.svgElement = document.getElementById("mp4_player_svg_" + config.id);
                            
                            if (!Hls.isSupported()) {
                                console.log("Hls is not supported on this device");
                                // TODO show this on the screen
                                return;
                            }
                                
                            var hls = new Hls();
                            hls.loadSource(config.sourceValue); // TODO this doesn't work when source type "msg", but only for type "url"
                            hls.attachMedia($scope.videoElement);
                            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                                $scope.videoElement.play();
                            });
                        }

                        $scope.$watch('msg', function(msg) { 
                            if (!msg) {
                                // Ignore undefined msg
                                return;
                            }
                            debugger;
                        })
                    }
                });
            }
        }
        catch (e) {
            console.log(e);
        }
		
        node.on("close", function() {
            if (done) {
                done();
            }
        });
    }
    
    RED.nodes.registerType("ui_mp4_player", Mp4PlayerNode);
    
    // By default the UI path in the settings.js file will be in comment:
    //     //ui: { path: "ui" },
    // But as soon as the user has specified a custom UI path there, we will need to use that path:
    //     ui: { path: "mypath" },
    var uiPath = ((RED.settings.ui || {}).path) || 'ui';
	
    // Create the complete server-side path
    uiPath = '/' + uiPath + '/ui_mp4_player/:resource';

    // Replace a sequence of multiple slashes (e.g. // or ///) by a single one
    uiPath = uiPath.replace(/\/+/g, '/');
	
    // Make all the static resources from this node public available (i.e. no_camera.png file), for the client-side dashboard widget.
    RED.httpNode.get(uiPath, function(req, res) {
        var fullPath;
        
        switch(req.params.resource) { 
            case "hls.js":
                if (hlsJsPath) {
                    fullPath = hlsJsPath;
                }
                break;
            default:
                console.log("Unknown mp4 player resource requested.");
        }
        
        if (fullPath) {
            res.sendFile(fullPath);
        }
        else {
            res.status(404).json('Unknown mp4 player resource requested');
        }
    });
}
