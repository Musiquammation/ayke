Produce a comprehensive Markdown document that explains **all game mechanics** to a player in a precise, detailed, and technically accurate way.

The final document will subsequently be provided to another AI. Therefore, it must be written not merely as a player guide, but as a **complete semantic description of the game's rules, systems, interactions, and strategic possibilities**, allowing an AI to reason about the game and make informed decisions.

## 1. Analyze the game first

Before writing the final Markdown document, create a detailed plan that identifies **every relevant game mechanic and system**.

The plan should be exhaustive rather than superficial. For each mechanic, determine:

* What the mechanic does
* Its purpose
* Its inputs and outputs
* Its rules and constraints
* Its interactions with other mechanics
* Its edge cases
* When it becomes relevant
* How it affects the player's decisions
* Any numerical values, thresholds, timers, cooldowns, urseful code-segments, formulas, or conditions involved

Do not omit mechanics simply because they appear minor. Small mechanics can have important strategic consequences.

## 2. Produce the final Markdown documentation

Using the plan, write a detailed Markdown document covering all identified mechanics.

Organize the document into logical sections. The structure should make it easy for an AI to retrieve and reason about individual rules.

For each mechanic, clearly distinguish between:

* **Rules:** what objectively happens
* **Conditions:** when it happens
* **Effects:** what changes as a result
* **Constraints:** what prevents or limits an action
* **Interactions:** how it interacts with other mechanics
* **Strategic implications:** why the mechanic matters

Use precise terminology consistently throughout the document.

When useful, include:

* Tables
* Formulas
* Pseudocode
* Code excerpts
* Concrete examples
* State transitions
* Timelines
* Explicit conditions such as `if / else`
* Numerical values and thresholds

Code excerpts should be used when they help clarify the actual implementation or behavior. Do not include irrelevant implementation details.

## 3. Explain the game state

Describe all important elements of the game state that can influence decisions.

For each relevant variable, entity, resource, status, or timer, explain:

* What it represents
* Its possible values or states
* How it changes
* What can cause it to change
* How it affects gameplay
* Whether the player can directly influence it

If the game contains entities such as players, objects, projectiles, zones, resources, objectives, or teams, document their relevant properties and interactions.

## 4. Identify the core gameplay loop

Explicitly describe the game's gameplay loop.

Explain:

1. What the player is trying to accomplish
2. What information the player observes
3. What decisions the player makes
4. What actions they can take
5. What consequences those actions produce
6. How those consequences change the game state
7. How the resulting state leads to the next decision

Describe both the **short-term action loop** and the **long-term progression/objective loop**, if applicable.

## 5. Identify objectives

List all objectives available to the player.

For each objective, explain:

* The exact success condition
* The conditions required to progress toward it
* What prevents progress
* The possible ways of achieving it
* The relative importance of the objective
* How it interacts with other objectives
* Whether objectives can conflict with one another

Distinguish between:

* Primary objectives
* Secondary objectives
* Optional objectives
* Immediate tactical objectives
* Long-term strategic objectives

## 6. Analyze strategies

Identify the strategies that can be used to play the game effectively.

Do not merely list generic advice such as "play aggressively" or "play defensively." Derive strategies from the actual mechanics.

For each strategy, explain:

* Its underlying principle
* Which mechanics it exploits
* Its objective
* When it is effective
* When it is ineffective
* Its risks
* Its advantages
* Its disadvantages
* What information is required to use it correctly
* What actions typically implement it

Identify different viable playstyles when they exist.

For example, if applicable, distinguish between:

* Aggressive vs. defensive play
* Risky vs. safe play
* Short-term vs. long-term optimization
* Resource-efficient vs. resource-intensive play
* Solo vs. team-oriented play
* Opportunistic vs. planned play

Do not assume that these categories exist if the mechanics do not support them.

## 7. Explain decision-making and action timing

Identify situations where **the timing of an action matters**.

For every important action or mechanic, explain:

* When the action should generally be triggered
* When it should not be triggered
* What conditions make it optimal
* What signals indicate that it is the right time
* What can happen if it is triggered too early
* What can happen if it is triggered too late
* What alternative actions are available

Where appropriate, express these decisions as explicit conditional rules or decision trees.

For example:

```text
IF condition A is true
    AND condition B is false
    THEN action X is generally preferable
ELSE
    consider action Y
```

The goal is to make the decision-making process sufficiently explicit that another AI could use the documentation to select actions.

## 8. Explain interactions and emergent behavior

Pay particular attention to interactions between mechanics.

Identify combinations of mechanics that produce meaningful effects, including:

* Synergies
* Counters
* Trade-offs
* Risk/reward situations
* Resource conversions
* Timing windows
* Positioning advantages
* Chain reactions
* Situations where one mechanic changes the optimal use of another

If several individually simple mechanics combine to create a more complex strategy, explain that interaction explicitly.

## 9. Distinguish facts from strategic interpretation

The document must clearly separate:

**Objective game rules**
from
**strategic recommendations and interpretations**.

Do not present an inferred strategy as if it were a game rule.

If a conclusion is derived from several mechanics rather than explicitly encoded in the rules, state that clearly.

## 10. Optimize the document for AI reasoning

Because another AI will consume this document, prioritize **precision, completeness, explicit relationships, and unambiguous language** over literary style.

Avoid:

* Vague descriptions
* Unexplained terminology
* Redundant prose
* Unsupported assumptions
* Generic gaming advice
* Ambiguous pronouns
* Implicit rules that could be stated explicitly

Prefer statements such as:

> When X occurs while condition Y is true, Z happens.

over:

> X can be useful in this situation.

Whenever possible, make causal relationships explicit.

## 11. Final strategic synthesis

End the document with a concise but comprehensive synthesis containing:

### Core loop

The fundamental sequence of actions and decisions.

### Win conditions / objectives

What ultimately determines success.

### Key mechanics

The mechanics that have the greatest impact on decision-making.

### Main strategies

The major viable approaches to achieving the objectives.

### Critical decisions

The decisions where choosing correctly has the greatest impact.

### Action timing

The most important situations where timing determines effectiveness.

### Common mistakes

Identify actions or decisions that are mechanically possible but strategically inefficient, if applicable.

### AI decision framework

Provide a high-level framework that an AI could follow when deciding what to do next.

For example:

```text
1. Evaluate the current game state.
2. Identify the current primary objective.
3. Check immediate threats and opportunities.
4. Evaluate available actions.
5. Eliminate actions that violate current constraints.
6. Compare remaining actions according to their expected outcome.
7. Consider timing and future consequences.
8. Select and execute the highest-value action.
9. Re-evaluate the game state after the action.
```

Adapt this framework to the actual game rather than blindly following the example.

## Important requirements

* Be exhaustive.
* Do not invent mechanics that are not supported by the game.
* Do not omit mechanics because they seem obvious.
* Preserve exact numerical values whenever they are known.
* Explicitly document dependencies and interactions between systems.
* Explain edge cases whenever they can affect gameplay.
* Use code excerpts when they clarify implementation behavior.
* Derive strategic recommendations from the documented mechanics.
* Make the final document self-contained: an AI reading it should not need the original source code to understand the game's rules and strategic structure, unless a particular implementation detail genuinely cannot be determined.
* If some behavior cannot be determined from the available information, explicitly mark it as **unknown** rather than guessing.

### Required workflow

First output the **detailed exhaustive plan** listing every mechanic and subsection you intend to document (don't just make a list, write `make 1. evaluate the current game state : blablabla`). It must be verbose.

Then output the **complete Markdown documentation** based on that plan.
Produce a markdown file.

Do not skip the planning phase.
