#!/bin/bash
#
#  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
#  with the License. A copy of the License is located at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
#  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
#  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
#  and limitations under the License.
#

{
	set -e
	SUDO=''
	if [ "$(id -u)" != "0" ]; then
		SUDO='sudo'
		echo "This script requires superuser access."
		echo "You will be prompted for your password by sudo."
		# clear any previous sudo permission
		sudo -k
	fi

	# run inside sudo
	$SUDO bash <<SCRIPT
  set -e

  echoerr() { echo "\$@" 1>&2; }

  if [[ ! ":\$PATH:" == *":/usr/local/bin:"* ]]; then
    echoerr "Your path is missing /usr/local/bin, you need to add this to use this installer."
    exit 1
  fi

  if [ "\$(uname)" == "Darwin" ]; then
    OS=darwin
  elif [ "\$(expr substr \$(uname -s) 1 5)" == "Linux" ]; then
    OS=linux
  else
    echoerr "This installer is only supported on Linux and MacOS"
    exit 1
  fi

  ARCH="\$(uname -m)"
  if [ "\$ARCH" == "x86_64" ]; then
    ARCH=x64
  elif [[ "\$ARCH" == aarch* ]]; then
    ARCH=arm
  elif [[ "\$ARCH" == arm* ]]; then
    ARCH=arm
  else
    echoerr "unsupported arch: \$ARCH"
    exit 1
  fi

  mkdir -p /usr/local/lib
  cd /usr/local/lib
  rm -rf sif
  rm -rf ~/.local/share/sif/client
  if [ \$(command -v xz) ]; then
    URL=https://github.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework-cli/releases/download/0.1.0/sif-v0.1.0-41018dd-\$OS-\$ARCH.tar.xz
    TAR_ARGS="xJ"
  else
    URL=https://github.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework-cli/releases/download/0.1.0/sif-v0.1.0-41018dd-\$OS-\$ARCH.tar.gz
    TAR_ARGS="xz"
  fi
  echo "Installing CLI from \$URL"
  if [ \$(command -v curl) ]; then
    curl "\$URL" | tar "\$TAR_ARGS"
  else
    wget -O- "\$URL" | tar "\$TAR_ARGS"
  fi
  # delete old heroku bin if exists
  rm -f \$(command -v sif) || true
  rm -f /usr/local/bin/sif
  ln -s /usr/local/lib/sif/bin/sif /usr/local/bin/sif

  # on alpine (and maybe others) the basic node binary does not work
  # remove our node binary and fall back to whatever node is on the PATH
  /usr/local/lib/sif/bin/node -v || rm /usr/local/lib/sif/bin/node

SCRIPT
	# test the CLI
	LOCATION=$(command -v sif)
	echo "sif installed to $LOCATION"
	sif --version
}
