{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.opencode-git-tools;

  inherit (lib)
    literalExpression
    mkAfter
    mkEnableOption
    mkIf
    mkOption
    types
    ;

  pluginEntry = cfg.package.plugin;
in
{
  options.programs.opencode-git-tools = {
    enable = mkEnableOption "the opencode-git-tools OpenCode plugin";

    package = mkOption {
      type = types.package;
      default = pkgs.opencode-git-tools;
      defaultText = literalExpression "pkgs.opencode-git-tools";
      description = ''
        The opencode-git-tools package to use.

        Either add {option}`pkgs.opencode-git-tools` to the package set
        (via the flake's `overlays.default`) or point this option at the
        package explicitly, e.g.
        `input.self.packages.$\{pkgs.system}.default`.
      '';
    };

    enableCommands = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Whether to install the Git slash commands (`/git-status`,
        `/git-tree`, `/git-commit`, `/git-review`) into
        {file}`~/.config/opencode/commands/`.
      '';
    };
  };

  config = mkIf cfg.enable {
    # Register the plugin through opencode's `plugin` mechanism. This is the
    # documented way to load a plugin entrypoint that imports
    # `@opencode-ai/plugin` (opencode bundles that package for plugin
    # references). `programs.opencode.tools` is for single tool files and
    # cannot resolve `@opencode-ai/plugin` for materialized store paths.
    programs.opencode.settings.plugin = [ pluginEntry ];

    # Register the slash commands through programs.opencode.commands so they
    # merge with any commands the user defines themselves. Each value is the
    # store path of an individual command file exported by the package, so
    # the opencode module symlinks the file into ~/.config/opencode/commands/.
    programs.opencode.commands = mkIf cfg.enableCommands (
      lib.mapAttrs (_: file: builtins.readFile file) cfg.package.commands
    );

    assertions = [
      {
        assertion = cfg.package ? plugin && cfg.package ? commands;
        message = ''
          programs.opencode-git-tools.package must provide `plugin` and
          `commands` passthru outputs. Use the opencode-git-tools package
          from this repository (see the flake's `overlays.default`).
        '';
      }
    ];
  };
}
