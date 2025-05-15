/* eslint-disable */
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) => {
        typeof child === 'object' ? child : createTextElement(child)
      })
    }
  };
}

function createTextElement(text) {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: []
    }
  };
}

function createDom(fiber) {
  const dom = fiber.type === 'TEXT_ELEMENT'
    ? document.createTextNode('')
    : document.createElement(fiber.type);
  updateDom(dom, {}, fiber.props);
  /* const isProperty = (key) => key !== 'children'; */
  // if (fiber.props) {
  /* Object.keys(fiber.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = fiber.props[name];
    }); */
  return dom;
  // }
}

let nextUnitOfWork = null;
let wipRoot = null; // work in progress root
let currentRoot = null; // save a reference to that “last fiber tree we committed to the DOM” after we finish the commit

// keep track of the nodes we need to delete.
// when we commit the fiber tree to the DOM we do it from the work in progress root, which doesn’t have the old fibers
let deletions = null;

function commitRoot() {
  // when we are commiting the changes to the DOM,
  // we also use the fibers from that array(deletions)
  deletions.forEach(commitWork);
  // add nodes to dom
  // recursively append all the nodes to the dom
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) return;

  // to find the parent of a DOM node we’ll need
  // to go up the fiber tree until we find a fiber with a DOM node
  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
    // If the fiber has a PLACEMENT effect tag we do the same as before,
    // append the DOM node to the node from the parent fiber.
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
    // And if it’s an UPDATE, we need to update the existing DOM node with the props that changed.
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === 'DELETION') {
    // If it’s a DELETION, we do the opposite, remove the child.
    // domParent.removeChild(fiber.dom);
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

const isEvent = (key) => key.startsWith('on');
const isProperty = (key) => key !== 'children' && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);
function updateDom(dom, prevProps, nextProps) {
  // remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });
  
  // remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = '';
    });

  // add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });

  // set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });
}

function render(element, container) {
  // keep track of the root of the fiber tree
  // We call it the work in progress root or wipRoot
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    alternate: currentRoot // a link to the old fiber
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

function workLoop(deadline) {
  let shouldYield = false;
  while(nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  // once we finish all the work we commit the whole fiber tree to the DOM
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }
  
  // return next unit of work
  // first try with the child
  // then with the sibling, then with the uncle, and so on
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

let wipFiber = null; // work in progress fiber
let hookIndex = null; // current hook index.

// update function component
/* 
  Function components are differents in two ways:

  the fiber from a function component doesn’t have a DOM node
  and the children come from running the function instead of getting them directly from the props
*/
function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function useState(initial) {
  const oldHook = wipFiber.alternate
    && wipFiber.alternate.hooks
    && wipFiber.alternate.hooks[hookIndex];
  
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: []
  };

  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot
    };
    // set a new work in progress root as the next unit of work so the work loop can start a new render phase.
    nextUnitOfWork = wipRoot;
    deletions = [];
  };
  
  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

// update component
function updateHostComponent(fiber) {
  // add dom node and append it to the DOM
  // keep track of the DOM node in the fiber.dom
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  // We are adding a new node to the DOM each time we work on an element.
  // And, remember, the browser could interrupt our work before we finish rendering the whole tree.
  // In that case, the user will see an incomplete UI. And we don’t want that.
  // if (fiber.parent) {
  //   fiber.parent.dom.appendChild(fiber.dom);
  // }
  // for each child create new fiber
  reconcileChildren(fiber, fiber.props.children);
}

// create the new fibers
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  // The element is the thing we want to render to the DOM
  // and the oldFiber is what we rendered the last time.
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;
  while(index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    const sameType = oldFiber && element && element.type === oldFiber.type;
    if (sameType) {
      // if the old fiber and the new element have the same type,
      // we can keep the DOM node and just update it with the new props

      // When the old fiber and the element have the same type,
      // we create a new fiber keeping the DOM node from the old fiber and the props from the element.
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: 'UPDATE'
      }
    }
    if (element && !sameType) {
      // if the type is different and there is a new element,
      // it means we need to create a new DOM node
      
      // for the case where the element needs a new DOM node
      // we tag the new fiber with the PLACEMENT effect tag
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: 'PLACEMENT'
      }
    }
    if (oldFiber && !sameType) {
      // if the types are different and there is an old fiber,
      // we need to remove the old node

      // for the case where we need to delete the node,
      // we don’t have a new fiber so we add the effect tag to the old fiber
      oldFiber.effectTag = 'DELETION';
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    // add it to the fiber tree setting it either as a child or as a sibling,
    // depending on whether it’s the first child or not.
    if (index === 0) {
      wipFiber.child = newFiber;
    } else {
      prevSibling.sibling = newFiber;
    }
    prevSibling = newFiber;
    index++;
  }
}


const Didact = {
  createElement,
  render,
  useState
};

/** @jsx Didact.createElement */
// const element = (
//   <div style="background: salmon">
//     <h1>Hello World</h1>
//     <h2 style="text-align:right">from Didact</h2>
//   </div>
// );
const container = document.getElementById('root');
// Didact.render(element, container);
/* Didact.render({
  type: 'div',
  props: {
    style: 'background: salmon',
    children: [
      {
        type: 'h1',
        props: {
          // children: ['Hello World']
          children: [
            {
              type: 'TEXT_ELEMENT',
              props: {
                nodeValue: 'Hello World',
                children: []
              }
            }
          ]
        }
      },
      {
        type: 'h2',
        props: {
          // children: ['from Didact'],
          children: [
            {
              type: 'TEXT_ELEMENT',
              props: {
                nodeValue: 'from Didact',
                children: []
              }
            }
          ],
          style: 'text-align:right'
        }
      }
    ]

  }
}, container); */

/* let value = 'World';
const updateValue = (e) => {
  rerender(e.target.value);
}
const rerender = (value) => {
  const element = {
    type: 'div',
      props: {
        children: [
          {
            type: 'input',
            props: {
              value,
              onInput: updateValue,
              children: []
            }
          },
          {
            type: 'h2',
            props: {
              children: [
                {
                  type: 'TEXT_ELEMENT',
                  props: {
                    nodeValue: 'Hello ',
                    children: []
                  }
                },
                {
                  type: 'TEXT_ELEMENT',
                  props: {
                    nodeValue: value,
                    children: []
                  }
                }
              ],
            }
          }
        ]
      }
  };
  Didact.render(element, container);
};
rerender('World'); */

function App(props) {
  /* return Didact.createElement(
    "h1",
    null,
    "Hi ",
    props.name
  ); */
  return ({
    type: 'h1',
    props: {
      children: [
        {
          type: 'TEXT_ELEMENT',
          props: {
            nodeValue: 'Hi ',
            children: []
          }
        },
        {
          type: 'TEXT_ELEMENT',
          props: {
            nodeValue: props.name,
            children: []
          }
        }
      ]
    }
  });
}
const element = Didact.createElement(App, {
  name: "foo",
});
// Didact.render(element, container);

function Counter() {
  const [state, setState] = Didact.useState(1);
  return ({
    type: 'button',
    props: {
      onClick: () => setState((c) => c + 1),
      children: [
        {
          type: 'TEXT_ELEMENT',
          props: {
            nodeValue: 'Count: ',
            children: []
          }
        },
        {
          type: 'TEXT_ELEMENT',
          props: {
            nodeValue: state,
            children: []
          }
        }
      ]
    }
  })
}

Didact.render(<Counter />, container);