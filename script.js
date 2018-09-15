function buildWikidataQuery(parliament, term, time, language) {
    var base = `https://query.wikidata.org/bigdata/namespace/wdq/sparql?format=json&query=`;
     
    var query = `
        SELECT ?partyLabel ?rgb ?party (COUNT(*) as ?count)
        WHERE
        {
            ?item wdt:P39 wd:${parliament} .
            ?item p:P39 ?membership . 
            ?membership pq:P2937 wd:${term} .
            ?membership pq:P4100 ?party .
            optional{?party wdt:P465 ?rgbvalue . }
            BIND(IF(BOUND(?rgbvalue),?rgbvalue,"000000") AS ?rgb).
            OPTIONAL { ?membership pq:P580 ?startDate. }
            OPTIONAL { ?membership pq:P582 ?endDate. }
            BIND(IF(BOUND(?startDate), ?startDate, now()) AS ?start)
            BIND(IF(BOUND(?endDate), ?endDate, now()) AS ?end)
            FILTER ( ?end >= "${time}T00:00:00+00:00"^^xsd:dateTime ) 
            FILTER ( ?start <= "${time}T00:00:00+00:00"^^xsd:dateTime )
            SERVICE wikibase:label { bd:serviceParam wikibase:language "${language}" }
        }
        group by ?party ?partyLabel ?rgb 
        order by desc(?count)
        #disable-caching-${Math.random()}
    `;
    var encodedQuery = encodeURIComponent(query);
    return base + encodedQuery;
}
 
function getWikidataQuery(url) {
    $.ajax({ 
        type: "GET",
        dataType: "json",
        url: url,
        success: function(data){
            for (var binding in data.results.bindings) {
                resultsList.push(data.results.bindings[binding]);
            }
            generate();
        } 
    });
}
 
function getTotal() {
    var total = 0;
    for (var result in resultsList) {
        total += parseInt(resultsList[result].count.value);
    }
    return total;
}
 
function getCoordinates(r, b) {
    var x = parseFloat(r * Math.cos(b/r - Math.PI)).toFixed(10);
    var y = parseFloat(r * Math.sin(b/r - Math.PI)).toFixed(10);
    return [x, y];
}
 
function findA(m, n, r) {
    var x = (Math.PI*n*r)/(m-n)
    var y = 1+(Math.PI*(n-1)*n/2)/(m-n)
 
    var a = x/y
    return a
}
function getScore(m, n, r) {
     return Math.abs(findA(m, n, r)*n/r-(5/7))
}
 
function merge(arrays) {
    var result = []
    for(var list of arrays) result = result.concat(list)
    return result
}
 
function findN(m, r) {
    var n = Math.floor(Math.log(m)/Math.log(2)) || 1;
    var a = findA(m, n, r);
    var distance = getScore(m, n, r);
 
    var direction = 0;
    if(getScore(m, n+1, r)<distance) direction = 1;
    if(getScore(m, n-1, r)<distance && n>1) direction = -1;
 
    while(getScore(m, n+direction, r)<distance&&n>0){
        distance = getScore(m, n+direction, r);
        n+=direction;
    }
    return n;
}
 
function nextRing (rings, ringProgress) {
    var progressQuota, tQuota;
    for(var index in rings){
        tQuota = parseFloat((ringProgress[index] || 0)/rings[index].length).toFixed(10);
        if(!progressQuota || tQuota<progressQuota) progressQuota = tQuota
    }
    for(var index in rings){
        tQuota = parseFloat((ringProgress[index] || 0)/rings[index].length).toFixed(10);
        if(tQuota==progressQuota) return index
    }
}
 
function createSvgNode(type) {
    return document.createElementNS("http://www.w3.org/2000/svg", type);
}
 
function generatePoints(parliament, r0) {
 
    // calculate seat count
    var totalSeats = getTotal();
     
    // calculate number of rings
    var numberOfRings = findN(totalSeats, r0)
    // calculate seat distance
    var a0 = findA(totalSeats, numberOfRings, r0)
 
    // calculate ring radii
    var rings = []
    for(var i = 1; i <= numberOfRings; i++){
        rings[i] = r0 - (i-1) * a0
    }
 
    // calculate seats per ring
    rings = distribute(rings, totalSeats)
 
    var r, a, point
 
    // build seats
    // loop rings
    var ring
    for(var i = 1; i <= numberOfRings; i++){
        ring = []
        // calculate ring-specific radius
        r = r0 - (i-1)*a0
        // calculate ring-specific distance
        a = (Math.PI*r) / ((rings[i]-1) || 1)
 
        // loop points
        for(let j=0; j<=rings[i]-1; j++){
            point = getCoordinates(r, j*a)
            point[2] = 0.4*a0
            ring.push(point)
        }
        points.push(ring)
    }
 
    // fill seats
    var initial = true
    var ringProgress = Array(points.length).fill(0)
    for(var party in resultsList){
        for(var i=0; i<parseInt(resultsList[party].count.value); i++){
            ring = nextRing(points, ringProgress)
            points[ring][ringProgress[ring]][3] = resultsList[party].rgb.value
            points[ring][ringProgress[ring]][4] = resultsList[party].partyLabel.value
            ringProgress[ring]++
        }
    }
    return merge(points)
}
 
function pointToSVG(point) {
    var circle = createSvgNode("circle");
    circle.setAttributeNS(null, "cx", point[0]);
    circle.setAttributeNS(null, "cy", point[1]);
    circle.setAttributeNS(null, "r", point[2]);
    circle.setAttributeNS(null, "fill", "#" +point[3]);
    circle.className = point[4];
    return circle;
}
 
function createText() {
    var text = createSvgNode("text");
    text.setAttributeNS(null, "x", 0);
    text.setAttributeNS(null, "y", 0);
    text.setAttributeNS(null, "class", "seatNumber");
    text.innerHTML = getTotal();
    text.setAttributeNS(null, "style", "font-family: Helvetica; font-size: 5px;");
    text.setAttributeNS(null, "text-anchor", "middle");
    return text;
}
 
function generate() {
    document.getElementById("svgContainer").innerHTML = ""; 
    document.getElementById("legend").innerHTML = "";
     
    var seatCount = getTotal();
    var radius = 20
    var points = generatePoints(resultsList, radius)
     
    if (!points[0]) {
        document.getElementById("svgContainer").innerHTML = "The parameters proiduced no results.  Please check the parameters and data and try again"
    } else {
        var a = points[0][2]/0.4
    var elements = points.map(pointToSVG)
    // Create the svg element
    var svg = createSvgNode("svg");
    svg.setAttribute("viewBox", [-radius-a/2, -radius-a/2, 2*radius+a, radius+a].join(','));
     
    // Add each circle to the svg   
    for (var element in elements) {
        svg.append(elements[element]);
    }
     
    // Create the text for the total number of seats and add it to the svg
    var text = createText();
    svg.append(text);
 
    // Add the svg to the body
    var div = document.getElementById("svgContainer"); 
    div.append(svg);
     
    var content = document.getElementById("svgContainer").innerHTML;
    var preamble = '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">';
    var safePreamble = preamble.replace(/</g,"&lt;").replace(/>/g,"&gt;");
    var safe = content.replace(/</g,"&lt;").replace(/>/g,"&gt;");
    document.getElementById("svgCode").innerHTML = safePreamble +"" + safe;
    document.getElementById("codeContainer").style.visibility = "visible";
 
    generateLegend();
}
}
 
function generateLegend() {
    var legend = document.getElementById("legend");
    for (result in resultsList) {
        legend.innerHTML += "<span class='legendBubble' style='background-color:#" + resultsList[result].rgb.value + "'></span>"
        legend.innerHTML += "<span class='legendLabel'>" + resultsList[result].partyLabel.value + " - " +resultsList[result].count.value + "</span><br/>"
    }
}
 
function calculateSeats(votes, divisor) {
    var distribution = {}
    var seats = 0
    for(var party in votes){
        distribution[party] = Math.round(votes[party] / divisor)
        seats += distribution[party]
    }
    return {distribution, seats}
}
 
function distribute(votes, seats) {
    // initial settings for divisor finding
    var voteSum = 0;
    for(var party in votes){
        voteSum += votes[party]
    }
    var low = voteSum / (seats - 2)
    var high = voteSum / (seats + 2)
    var divisor = voteSum / seats
 
    var parliament = calculateSeats(votes, divisor)
 
    // find divisor
    while(parliament.seats != seats){
        if(parliament.seats < seats) low = divisor
        if(parliament.seats > seats) high = divisor
        divisor = (low + high) / 2
        parliament = calculateSeats(votes, divisor)
    }
 
    return parliament.distribution
}
 
var points = [];
var resultsList = [];
 
function getLabel(id, node) {
    var url = "https://www.wikidata.org/w/api.php?action=wbgetentities&origin=*&format=json&props=labels&languages=en&ids=" + id;
    $.ajax({ 
        type: "GET",
        dataType: "json",
        url: url,
        success: function(data){
             document.getElementById(node).innerHTML = data.entities[id].labels.en.value;
        } 
    });
}
 
function setUp(parliament, term) {
    var parliamentInput = document.getElementById("parliament");
    var termInput = document.getElementById("term");
    var dateInput = document.getElementById("date");
    parliamentInput.value = "";
    termInput.value = "";
    dateInput.value = "";
    parliamentInput.placeholder = "e.g. Member of Parliament";
    termInput.placeholder = "e.g. 8th European Parliament";
    autocomplete(document.getElementById("parliament"));
    autocomplete(document.getElementById("term"));
    document.getElementById("codeContainer").style.visibility = "hidden";
 
} 
 
function update() {
    var parliamentParameter = document.getElementById("parliament").getAttribute("wikidata");
    var termParameter = document.getElementById("term").getAttribute("wikidata");
    var timeParameter = document.getElementById("date").value;
    var language = document.getElementById("language").value;
    resultsList = [];
    points = [];
    document.getElementById("svgContainer").innerHTML = "";
    var url = buildWikidataQuery(parliamentParameter, termParameter, timeParameter, language);
    getWikidataQuery(url);
}
 
setUp();
 
/**
 * This function handles all aspects of Autocomplete
 * 
 **/
function autocomplete(inp) {
    /*the autocomplete function takes two arguments,
    the text field element and an array of possible autocompleted values:*/
    var currentFocus;
    /*execute a function when someone writes in the text field:*/
    inp.addEventListener("input", function(e) {
        var a, b, i, val = this.value;
        /*close any already open lists of autocompleted values*/
        closeAllLists();
        if (!val) { return false;}
        currentFocus = -1;
        /*create a DIV element that will contain the items (values):*/
        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        /*append the DIV element as a child of the autocomplete container:*/
        this.parentNode.appendChild(a);
        if (val.length>2){
            // get array
            $.ajax({
                type: "GET",
                dataType: "json",
                url: "https://www.wikidata.org/w/api.php?action=wbsearchentities&search="+val+"&language=en&origin=*&format=json",
                success: function(data){
                    arr = data.search;
                    /*for each item in the array...*/
                    for (i = 0; i < arr.length; i++) {
                        /*check if the item starts with the same letters as the text field value:*/
                        /*create a DIV element for each matching element:*/
                        b = document.createElement("DIV");
                        /*make the matching letters bold:*/
                        b.innerHTML = "<span class='autocomplete-label'>" + arr[i].label + "</span>";
                        if (arr[i].description) {
                            b.innerHTML += "<br/><span class='description'>" + arr[i].description + "</span>";
                        }
                        /*insert a input field that will hold the current array item's value:*/
                        b.innerHTML += "<input type='hidden' value='" + arr[i].label + " (" + arr[i].id + ")'>";
                        b.innerHTML += "<input type='hidden' value='" + arr[i].id + "'>";
                        /*execute a function when someone clicks on the item value (DIV element):*/
                        b.addEventListener("click", function(e) {
                            /*insert the value for the autocomplete text field:*/
                            inp.value = this.getElementsByTagName("input")[0].value;
                            inp.setAttribute("wikidata", this.getElementsByTagName("input")[1].value);
                            $.ajax({
                                type: "GET",
                                dataType: "json",
                                url: "https://www.wikidata.org/w/api.php?action=wbgetclaims&entity="+this.getElementsByTagName("input")[1].value+"&origin=*&format=json",
                                success: function(data){
                                    var inception;
                                    var dissolution;
                                    if (data.claims.P571) { 
                                        inception = data.claims.P571[0].mainsnak.datavalue.value.time; 
                                    } else if (data.claims.P580){
                                        inception = data.claims.P580[0].mainsnak.datavalue.value.time; 
                                    } else {
                                        var date = new Date();
                                        var month = "" + (date.getMonth() +1);
                                        if (month < 10) {month = "0" + month;}
                                        inception = "+" + date.getFullYear() + "-" + month + "-" + date.getDate() + "00:00:00Z";
                                    }
                                    if (data.claims.P576) { 
                                        dissolution = data.claims.P576[0].mainsnak.datavalue.value.time; 
                                    } else if (data.claims.P582){
                                        dissolution = data.claims.P582[0].mainsnak.datavalue.value.time; 
                                    } else {
                                        var date = new Date();
                                        var month = "" + (date.getMonth() +1);
                                        if (month < 10) {month = "0" + month;}
                                        dissolution = "+" + date.getFullYear() + "-" + month + "-" + date.getDate() + "00:00:00Z";
                                    }
                                    var dateHeader = document.getElementById("date");
                                    dateHeader.placeholder = "Date must be between " + inception.substring(1, 11) + " and " + dissolution.substring(1, 11);
 
                                }
                            });
                            /*close the list of autocompleted values,
                            (or any other open lists of autocompleted values:*/
                            closeAllLists();
                        });
                        a.appendChild(b);
                    }
                } 
            });
        }   
    });
    /*execute a function presses a key on the keyboard:*/
    inp.addEventListener("keydown", function(e) {
        var x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) {
            /*If the arrow DOWN key is pressed,
            increase the currentFocus variable:*/
            currentFocus++;
            /*and and make the current item more visible:*/
            addActive(x);
        } else if (e.keyCode == 38) { //up
            /*If the arrow UP key is pressed,
            decrease the currentFocus variable:*/
            currentFocus--;
            /*and and make the current item more visible:*/
            addActive(x);
        } else if (e.keyCode == 13) {
            /*If the ENTER key is pressed, prevent the form from being submitted,*/
            e.preventDefault();
            if (currentFocus > -1) {
                /*and simulate a click on the "active" item:*/
                if (x) x[currentFocus].click();
            }
        }
    });
    function addActive(x) {
        /*a function to classify an item as "active":*/
        if (!x) return false;
        /*start by removing the "active" class on all items:*/
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        /*add class "autocomplete-active":*/
        x[currentFocus].classList.add("autocomplete-active");
    }
    function removeActive(x) {
        /*a function to remove the "active" class from all autocomplete items:*/
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }
    function closeAllLists(elmnt) {
        /*close all autocomplete lists in the document,
        except the one passed as an argument:*/
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inp) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }
    /*execute a function when someone clicks in the document:*/
    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
} 
