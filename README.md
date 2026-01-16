# timing-log-grapher
A simple tool to parse timing log files and generate graphical representations of the data.

## How to use
1. Open index.html in a web browser.

2. Enter logs in format:
```
!!! <name> start: <time in mil>
!!! <name> end: <time in mil>
```
example in dart
```
print('!!! cool-func start: ${DateTime.now().millisecondsSinceEpoch}');
await coolFunc();
print('!!! cool-func end: ${DateTime.now().millisecondsSinceEpoch}');
```

3. Click visualize button
4. ???
5. Profit

## Other features
- tabs
  - renameable and dragable
- track opacity
- zoom in/out
- timing gaps
- track rearrangement and resize
- hisory (kinda works)
- saves to local storage, so reloads keep your data : )

## notes
I've have found that though these prints I get extremely similar (+-5ms) times to what is reported through tracing, so while you shouldn't use this directly for final performance measurments, it is a very close representation of what the traces will return.
