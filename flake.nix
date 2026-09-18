{
  description = "Global OpenCode plugin: Git tools with auto-context injection";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager.url = "github:nix-community/home-manager";
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
      ...
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;

      pkgFor = system: nixpkgs.legacyPackages.${system}.callPackage ./nix/pkg.nix { };
    in
    {
      packages = forAllSystems (system: rec {
        opencode-git-tools = pkgFor system; 
        default = opencode-git-tools;
      });

      overlays.default = final: prev: {
        opencode-git-tools = final.callPackage ./nix/pkg.nix { };
      };

      homeManagerModules = rec {
        opencode-git-tools = import ./nix/home-manager.nix;
        default = opencode-git-tools;
      };
    };
}
