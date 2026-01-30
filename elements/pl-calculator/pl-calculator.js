// npm install --save @cortex-js/compute-engine
// npm install --save mathlive

/**
 * @param {string} uuid 
 * @param {*} options TODO
 */
window.PLCalculator = async function (uuid, options) {
  const elementId = "#calculator-" + uuid;
  this.element = $(elementId);
  if (!this.element) {
    throw new Error("Calculator element " + elementId + " was not found!");
  }
  showPanel("main");
  initColumnNavigation();

  /** @type {typeof import("@cortex-js/compute-engine")} */
  const { ComputeEngine } = await import("compute-engine");
  /** @type {typeof import("mathlive")} */
  const { MathLive } =  await import("mathlive");
  const ce = new ComputeEngine();
  ce.context.timeLimit = 1;

  ce.pushScope();
  const calculatorInputElement = document.getElementById("calculator-input");
  const calculatorOutput = document.getElementById("calculator-output");
  MathfieldElement.soundsDirectory = null;
  calculatorInputElement.menuItems = [];
  calculatorOutput.dataset.displayMode = "numeric"; // numeric or symbolic
  calculatorOutput.dataset.angleMode = "rad"; // rad or deg

  document.getElementsByName("calculate").forEach((button) =>
    button.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      calculate(true);
    })
  );

  /** @type {number} */
  let typingTimer; // Timer identifier
  const delay = 500; // 0.5 second delay
  calculatorInputElement.addEventListener("input", (e) => {
    clearTimeout(typingTimer); // Clear the previous timer
    typingTimer = setTimeout(() => {
      calculate(false);
    }, delay);
  });

  // Data from localStorage
  const calculatorLocalData = localStorage.getItem(elementId);
  if (!calculatorLocalData) {
    localStorage.setItem(
      elementId,
      JSON.stringify({ ans: null, variable: [], history: [], temp_input: null })
    );
  } else {
    const data = JSON.parse(calculatorLocalData);
    for (const historyItem of data.history) {
      addHistoryItem(
        historyItem.input,
        historyItem.displayed,
        historyItem.numeric
      );
    }
    if (data.ans) {
      ce.assign("ans", ce.parse(data.ans));
    }
    for (const variable of data.variable) {
      ce.assign(variable.name, ce.parse(variable.value));
    }
    if (data.temp_input) {
      calculatorInputElement.value = data.temp_input;
      calculatorInputElement.dispatchEvent(new Event("input"));
    }
  }

  // Initialize action for calculation
  function calculate(addToHistory = false) {
    const input = calculatorInputElement.value;
    // When there is no input, clear the output panel
    // instead of outputting "nothing"
    if (input.length == 0) {
      calculatorOutput.value = "";
      const copyButton = document.getElementById("calculator-output-copy");
      copyButton.onclick = function () {
        navigator.clipboard.writeText("");
      };
      return;
    }
    /** @type {import("@cortex-js/compute-engine").BoxedExpression} */
    let parsed = ce.parse(
      input,
      {
        parseNumbers: 'rational'
      }
    );
    if (calculatorOutput.dataset.angleMode === "deg") {
      parsed = ce.box(radianToDegree(parsed.json));
    }
    if (parsed.json[0] === "Assign" && parsed.json[1] === "InvisibleOperator") {
      parsed = ce.box([
        "Error",
        "",
        "Assignment operator can only be used on single-letter variables",
      ]);
    }
    /** @type {import("@cortex-js/compute-engine").BoxedExpression} */
    let evaluated;
    try {
      evaluated = parsed.evaluate();
    } catch (e) {
      if (e.name === "CancellationError") {
        calculatorInputElement.value = "";
        calculatorOutput.value = ce.box(["Error", "", "Output is too large"]);
      } else {
        evaluated = parsed.evaluate();
        calculatorInputElement.value = "";
        calculatorOutput.value = ce.box(["Error", "", e.message]);
      }
      return;
    }

    let displayed = "";
    if (calculatorOutput.dataset.displayMode === "symbolic") {
      displayed = evaluated.latex
    } else {
      displayed = evaluated.N().toLatex({ notation: "auto" });
    }
    calculatorOutput.value = `=${displayed}`;

    // Update copy button
    const copyButton = document.getElementById("calculator-output-copy");
    copyButton.onclick = function () {
      navigator.clipboard.writeText(evaluated.N().value);
    };

    const data = JSON.parse(localStorage.getItem(elementId));
    // Add to history
    if (addToHistory) {
      if (parsed.json[0] === "Assign") {
        const varName = parsed.json[1];
        const varVal = ce.box(parsed.json[2]).evaluate();
        data.variable.push({ name: varName, value: varVal.toLatex({ notation: "auto" }) });
      }
      try {
        ce.assign("ans", evaluated);
        data.ans = evaluated.toLatex({ notation: "auto" });
      } catch (e) {
        alert(e);
      }

      // Create item in history panel
      addHistoryItem(input, displayed, evaluated.N().value);

      // Add history data to localStorage
      data.history.push({
        input: input,
        displayed: displayed,
        numeric: evaluated.N().value,
      });

      // Clear current input and output panels
      calculatorInputElement.value = "";
      calculatorOutput.value = "";
    }
    data.temp_input = calculatorInputElement.value;
    localStorage.setItem(elementId, JSON.stringify(data));
  }

  // Define custom functions
  // n choose r
  ce.assign("nCr", (args) => {
    if (args.length != 2) {
      return ce.box(["Error", "", "nCr requires 2 inputs"]);
    }
    if (args[1] > args[0]) {
      return ce.number(0);
    }
    return ce
      .parse(
        `$$ \\frac{${args[0]}!}{(${args[1]})!*(${args[0]}-${args[1]})!} $$`
      )
      .evaluate();
  });

  // n permute r
  ce.assign("nPr", (args) => {
    if (args.length != 2) {
      return ce.box(["Error", "", "nPr requires 2 inputs"]);
    }
    if (args[1] > args[0]) {
      return ce.number(0);
    }
    return ce
      .parse(`$$ \\frac{${args[0]}!}{(${args[0]}-${args[1]})!} $$`)
      .evaluate();
  });

  // Sample standard deviation (divided by (n-1))
  ce.assign("stdev", (args) => {
    const nums = String(args[0])
      .substring(1, String(args[0]).length - 1)
      .split(",")
      .map(Number);
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b) / n;
    const variance =
      nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
    return ce.number(Math.sqrt(variance));
  });

  // Population standard deviation (divided by n)
  ce.assign("stdevp", (args) => {
    const nums = String(args[0])
      .substring(1, String(args[0]).length - 1)
      .split(",")
      .map(Number);
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b) / n;
    const variance = nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
    return ce.number(Math.sqrt(variance));
  });

  // Round to nearest integer
  ce.assign("round", (args) => {
    return ce.number(Math.round(args[0]));
  });

  // Buttons for number inputs
  for (let i = 0; i < 10; ++i) {
    const button = document.getElementById(`${i}`);
    prepareButton(button);
    button.addEventListener("click", () => {
      calculatorInputElement.insert(`${i}`);
    });
  }

  // Buttons for alphabet inputs
  for (let char = "a".charCodeAt(0); char <= "z".charCodeAt(0); ++char) {
    const letter = String.fromCharCode(char);
    const button = document.getElementById(letter);
    prepareButton(button);
    button.addEventListener("click", () => {
      calculatorInputElement.insert(button.textContent);
    });
  }

  // Upper/lowercase switch
  document.getElementsByName("shift").forEach((button) =>
    button.addEventListener("click", () => {
      button.classList.toggle("btn-light");
      button.classList.toggle("btn-secondary");
      for (let char = "a".charCodeAt(0); char <= "z".charCodeAt(0); ++char) {
        const letter = String.fromCharCode(char);
        const button = document.getElementById(letter);
        if (button.textContent <= "Z") {
          button.textContent = button.textContent.toLowerCase();
        } else {
          button.textContent = button.textContent.toUpperCase();
        }
      }
    })
  );

  // Backspace button
  document.getElementsByName("backspace").forEach((button) => {
    prepareButton(button);
    button.addEventListener("click", () => {
      calculatorInputElement.executeCommand(["deleteBackward"]);
    });
  });

  // Left/right
  document.getElementsByName("left").forEach((button) => {
    prepareButton(button);
    button.addEventListener("click", () => {
      calculatorInputElement.executeCommand(["moveToPreviousChar"]);
    });
  });
  document.getElementsByName("right").forEach((button) => {
    prepareButton(button);
    button.addEventListener("click", () => {
      calculatorInputElement.executeCommand(["moveToNextChar"]);
    });
  });

  // Clear all
  document.getElementsByName("clear").forEach((button) => {
    prepareButton(button);
    button.addEventListener("click", () => {
      calculatorInputElement.executeCommand(["deleteAll"]);
    });
  });

  // Other panel buttons
  const buttonActions = {
    div: "\\frac{#@}{#?}",
    frac: "\\frac{#0}{#?}",
    deg: "#@\\degree",
    sin: "\\sin(#0)",
    "sin-1": "\\sin^{-1}(#0)",
    cos: "\\cos(#0)",
    "cos-1": "\\cos^{-1}(#0)",
    tan: "\\tan(#0)",
    "tan-1": "\\tan^{-1}(#0)",
    sinh: "\\sinh(#0)",
    "sinh-1": "\\sinh^{-1}(#0)",
    cosh: "\\cosh(#0)",
    "cosh-1": "\\cosh^{-1}(#0)",
    tanh: "\\tanh(#0)",
    "tanh-1": "\\tanh^{-1}(#0)",
    ans: "\\operatorname{ans}",
    nPr: "\\operatorname{nPr}(#?,#?)",
    nCr: "\\operatorname{nCr}(#?,#?)",
    factorial: "#@!",
    mean: "\\operatorname{mean}([#?])",
    stdev: "\\operatorname{stdev}([#?])",
    stdevp: "\\operatorname{stdevp}([#?])",
    pi: "\\pi",
    e: "e",
    epowerx: "e^{#0}",
    apowerb: "#@^{#?}",
    sqrt: "\\sqrt{#0}",
    root: "\\sqrt[#?]{#0}",
    abs: "|#0|",
    round: "\\operatorname{round}(#0)",
    inv: "\\frac{1}{#@}",
    log: "\\log_{#?}{#0}",
    lg: "\\lg(#0)",
    ln: "\\ln(#0)",
    // TODO: add more name-latex insertion pair
    // For difference between #@, #?, look at https://cortexjs.io/mathlive/guides/shortcuts/
    // #0 is replaced with current selection, or placeholder if there is no selection
    sqr: "#@^2",
    perc: "\\%",
    lpar: "(",
    rpar: ")",
    assign: "\\coloneqq",
    mul: "\\times",
    minus: "-",
    plus: "+",
    "dec-point": ".",
    lbra: "[",
    rbra: "]",
    eq: "=",
  };

  setupButtonEvents(buttonActions);

  // Symbolic-numeric transformation
  prepareButton(document.getElementById("displayModeSwitch"));
  document.getElementById("displayModeSwitch").addEventListener("click", () => {
    if (calculatorOutput.dataset.displayMode === "numeric") {
      calculatorOutput.dataset.displayMode = "symbolic";
    } else {
      calculatorOutput.dataset.displayMode = "numeric";
    }
    calculate();
  });

  // Degree-radian transformation
  prepareButton(document.getElementById("angleModeSwitch"));
  document.getElementById("angleModeSwitch").addEventListener("click", () => {
    if (calculatorOutput.dataset.angleMode === "deg") {
      calculatorOutput.dataset.angleMode = "rad";
    } else {
      calculatorOutput.dataset.angleMode = "deg";
    }
    calculate();
  });

  // Keyboard handling
  function handleKeyPress(ev) {
    switch (ev.key) {
      case "Enter":
        calculate(true);
      case "Tab":
        if (calculatorInputElement.mode === "latex") {
          calculatorInputElement.mode = "math";
          ev.preventDefault();
        }
    }
  }
  calculatorInputElement.addEventListener("keydown", (ev) =>
    handleKeyPress(ev)
  );

  // Shortcuts
  calculatorInputElement.inlineShortcuts = {
    ...calculatorInputElement.inlineShortcuts, // Preserve default shortcuts
    ans: "\\operatorname{ans}",
    stdev: "\\operatorname{stdev}([#?])",
    stdevp: "\\operatorname{stdevp}([#?])",
    mean: "\\operatorname{mean}([#?])",
    root: "\\sqrt[#?]{#?}",
    round: "\\operatorname{round}(#?)",
    log: "\\log_{#?}{#?}",
    abs: "|#?|",
    ":=": "\\coloneqq",
    "**": "#@^{(#?)}",
    "^": "#@^{(#?)}",
  };

  function radianToDegree(json) {
    if (!Array.isArray(json)) {
      return json;
    }
    const trigFunc = [
      "Sin",
      "Cos",
      "Tan",
      "Cot",
      "Sec",
      "Csc",
      "Sinh",
      "Cosh",
      "Tanh",
      "Coth",
      "Sech",
      "Csch",
    ];
    const trigFuncInv = [
      "Arcsin",
      "Arccos",
      "Arctan",
      "Arctan2",
      "Acot",
      "Asec",
      "Acsc",
      "Arsinh",
      "Arcosh",
      "Artanh",
      "Arcoth",
      "Asech",
      "Acsch",
    ];
    let parsedExpr;
    if (trigFunc.includes(json[0])) {
      // If has a trig function, add a degree to the argument
      parsedExpr = [json[0], ["Degrees", radianToDegree(json[1])]];
    } else if (trigFuncInv.includes(json[0])) {
      // If has an inv trig function, divide output by degree
      parsedExpr = [
        "Divide",
        [json[0], radianToDegree(json[1])],
        ["Degrees", 1],
      ];
    } else {
      // If no trig function, recursively check the children
      parsedExpr = [json[0]];
      json.slice(1).forEach((item) => {
        parsedExpr.push(radianToDegree(item));
      });
    }
    return parsedExpr;
  }

  /**
   * @param {HTMLButtonElement} button
   * 
   * Prepares a button to maintain focus on the calculator input when clicked.
   * This prevents the input border from blinking when buttons are click.
   */
  function prepareButton(button) {
    // if the calculator input is focused, prevent losing focus when clicking button
    button.addEventListener("mousedown", (ev) => {
      if (document.activeElement === calculatorInputElement) {
        ev.preventDefault();
      }
    })
  }

  function setupButtonEvents(buttonActions) {
    for (const [buttonName, action] of Object.entries(buttonActions)) {
      document.getElementsByName(buttonName).forEach((button) => {
        prepareButton(button);
        button.addEventListener("click", () => {
          calculatorInputElement.insert(action);
        });
      });
    }
  }

  function addHistoryItem(input, displayed, numeric) {
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";

    // Calculation IO display
    const historyItemIO = document.createElement("div");
    historyItemIO.className = "text";

    // Copy button in history item
    const historyItemCopyButton = document.createElement("button");
    historyItemCopyButton.type = "button";
    historyItemCopyButton.className = "btn btn-secondary copy";
    historyItemCopyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
    historyItemCopyButton.onclick = function () {
      navigator.clipboard.writeText(numeric);
    };
    historyItemCopyButton.setAttribute("data-bs-toggle", "tooltip");
    historyItemCopyButton.setAttribute("data-bs-placement", "right");
    historyItemCopyButton.setAttribute("data-bs-delay", "300");
    historyItemCopyButton.title = "Copy this output";

    // Input and Output sections for calculation IO
    const historyItemInputDiv = document.createElement("div");
    historyItemInputDiv.className = "d-flex";
    const historyItemOutputDiv = document.createElement("div");
    historyItemOutputDiv.className = "d-flex";

    // Input text and button for calling from history
    const historyItemInputText = document.createElement("math-field");
    historyItemInputText.className = "history-text";
    historyItemInputText.innerHTML = input;
    historyItemInputText.contentEditable = false;
    
    const historyItemInputCall = document.createElement("button");
    historyItemInputCall.type = "button";
    historyItemInputCall.className = "btn btn-success copy";
    historyItemInputCall.innerHTML =
      '<i class="fa-solid fa-arrow-turn-down"></i>';
    historyItemInputCall.onclick = function () {
      calculatorInputElement.value = input;
      calculatorInputElement.dispatchEvent(new Event("input"));
      calculatorInputElement.focus();
    };
    historyItemInputCall.setAttribute("data-bs-toggle", "tooltip");
    historyItemInputCall.setAttribute("data-bs-placement", "right");
    historyItemInputCall.setAttribute("data-bs-delay", "300");
    historyItemInputCall.title = "Edit this input";

    // Output text and button for calling from history
    const historyItemOutputText = document.createElement("math-field");
    historyItemOutputText.className = "history-text";
    historyItemOutputText.innerHTML = `=${displayed}`;
    historyItemOutputText.contentEditable = false;
    
    const historyItemOutputCall = document.createElement("button");
    historyItemOutputCall.type = "button";
    historyItemOutputCall.className = "btn btn-success copy";
    historyItemOutputCall.innerHTML = '<i class="bi bi-box-arrow-in-down"></i>';
    historyItemOutputCall.onclick = function () {
      calculatorInputElement.insert(ce.parse(displayed).toString());
      calculatorInputElement.dispatchEvent(new Event("input"));
      calculatorInputElement.focus();
    };
    historyItemOutputCall.setAttribute("data-bs-toggle", "tooltip");
    historyItemOutputCall.setAttribute("data-bs-placement", "right");
    historyItemOutputCall.setAttribute("data-bs-delay", "300");
    historyItemOutputCall.title = "Use this output";

    const hr = document.createElement("hr");
    hr.style = "border: 1.5px solid; margin-bottom: 0.2em; margin-top: 0.2em;";

    historyItemInputDiv.appendChild(historyItemInputText);
    historyItemInputDiv.appendChild(historyItemInputCall);
    historyItemOutputDiv.appendChild(historyItemOutputText);
    historyItemOutputDiv.appendChild(historyItemOutputCall);

    historyItemIO.appendChild(historyItemInputDiv);
    historyItemIO.appendChild(hr);
    historyItemIO.appendChild(historyItemOutputDiv);

    historyItem.appendChild(historyItemIO);
    historyItem.appendChild(historyItemCopyButton);

    // Append to the history panel
    const historyPanel = document.getElementById("history-panel");
    historyPanel.insertBefore(historyItem, historyPanel.firstChild);
  }
};

/**
 * @param {string} panelClass
 */
function showPanel(panelClass) {
  // Hide all panels
  const panels = document.querySelectorAll(".keyboard");
  panels.forEach((panel) => (panel.style.display = "none"));

  // Show the selected panel
  const panelToShow = document.querySelectorAll(`.${panelClass}`);
  panelToShow.forEach((panel) => (panel.style.display = "flex"));
}

// Column navigation for responsive keyboards
function initColumnNavigation() {
  setupKeyboardNav('main-keyboard', ['show-functions', 'show-numbers']);
  setupKeyboardNav('func-keyboard', ['show-trig', 'show-math']);
  
  function setupKeyboardNav(keyboardId, columns) {
    const keyboard = document.getElementById(keyboardId);
    if (!keyboard) return;
    
    let columnIndex = 1;
    update();
    
    keyboard.querySelectorAll('.col-nav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        columnIndex = +!columnIndex;
        update();
      });
    });

    function update() {
      keyboard.classList.remove(...columns);
      keyboard.classList.add(columns[columnIndex]);
    }
  }
}

