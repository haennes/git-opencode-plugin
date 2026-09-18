{
  lib,
  pkgs,
  stdenvNoCC,
}:
let
  pkgJson = builtins.fromJSON (builtins.readFile ../package.json);

  exportedCommandNames = [
    "git-status"
    "git-tree"
    "git-commit"
    "git-review"
  ];
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = pkgJson.name;
  version = pkgJson.version;

  src = lib.cleanSource ../.;

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/lib/commands" "$out/lib/hooks"

    cp src/index.ts "$out/lib/opencode-git-tools.ts"
    cp commands/*.md "$out/lib/commands/"

    # Build check: the slash commands packaged here must match the command
    # set exported through passthru.commands. Update `exportedCommandNames`
    # in nix/pkg.nix when you add or remove a command.
    actual="$(cd commands && printf '%s\n' *.md | sed 's/\.md$//' | sort)"
    expected="$(printf '%s\n' ${builtins.concatStringsSep " " exportedCommandNames} | sort)"
    if [[ "$actual" != "$expected" ]]; then
      echo "error: exported commands do not match the commands/ directory" >&2
      echo "  exported in nix/pkg.nix: ${lib.concatStringsSep ", " exportedCommandNames}" >&2
      echo "  found in commands/:      $(echo "$actual" | tr '\n' ' ')" >&2
      exit 1
    fi

    cp hooks/* "$out/lib/hooks/"

    runHook postInstall
  '';

  passthru = {
    plugin = "${finalAttrs.finalPackage}/lib/opencode-git-tools.ts";
    # Each command file as its own store output so consumers (e.g. the
    # home-manager module) can reference them as genuine paths instead of
    # substrings of a package output.
    commands = let
      commandFile = name: pkgs.runCommandLocal "opencode-git-tools-${name}" { } ''
        cp "${finalAttrs.finalPackage}/lib/commands/${name}.md" "$out"
      '';
    in
      lib.genAttrs exportedCommandNames commandFile;
    hooks = "${finalAttrs.finalPackage}/lib/hooks";
  };

  meta = {
    description = "Global OpenCode plugin: Git tools with auto-context injection";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
    maintainers = with lib.maintainers; [ ];
  };
})