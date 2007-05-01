#!/usr/bin/perl -w
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is mozilla.org code.
#
# The Initial Developer of the Original Code is
# Ted Mielczarek <ted.mielczarek@gmail.com>
# Portions created by the Initial Developer are Copyright (C) 2006
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****
#
# Usage: make_symbol_store.pl <params> <dump_syms path> <symbol store path>
#                             <debug info files>
#   Runs dump_syms on each debug info file specified on the command line,
#   then places the resulting symbol file in the proper directory
#   structure in the symbol store path.  Accepts multiple files
#   on the command line, so can be called as part of a pipe using
#   find <dir> | xargs make_symbol_store.pl <dump_syms> <storepath>
#   Parameters accepted:
#     -c           : Copy debug info files to the same directory structure
#                    as sym files
#     -a "<archs>" : Run dump_syms -a <arch> for each space separated
#                    cpu architecture in <archs> (only on OS X)

use FileHandle;
use File::Path;
use File::Copy;
use File::Basename;

print "Usage: make_symbol_store.pl <params>" .
  "<dump_syms path> <storepath> <debug info files>\n"
  and exit if scalar @ARGV < 3;

# Given a symbol file generated by dump_syms,
# and a directory to store the resulting symbol path,
# move the symbol file into the directory structure
# expected by the breakpad processor.  For details, see:
# http://google-breakpad.googlecode.com/svn/trunk/src/processor/simple_symbol_supplier.h
sub rename_symbol_file
{
    my ($symbol_file, $dest_path) = @_;
    my $fh = FileHandle->new($symbol_file, "r");
    return "" unless $fh;

    my $line = <$fh>;
    return "" unless $line;
    $line =~ s/\s*$//;
    $fh->close();
    return "" unless $line =~ m/^MODULE/;

    # the first line of a sym file looks like:
    # MODULE os cpu identifier debug_file
    my ($guid,$dbgfile) = (split(/ +/, $line))[3..4];
    my $newpath = $dest_path . "/" . $dbgfile . "/" . $guid;
    eval { mkpath($newpath) };
    return "" if $@;

    if(move($symbol_file, $newpath)) {
        my $out = $newpath;
        my ($f) = fileparse($symbol_file);
        $out =~ s/^$dest_path//;
        $out =~ s|^/||;
        print "$out/$f\n";
        return $newpath;
    }

    return "";
}

my $copy_dbg = 0;
my @archs = ('');
while (@ARGV && $ARGV[0] =~ m/^-/) {
    my $arg = shift;
    if ($arg eq '-c') {
        $copy_dbg = 1;
    }
    elsif ($arg eq '-a') {
        @archs = (split(/\s+/, shift));
    }
}

my $dump_syms = shift;
my $symbol_path = shift;
foreach my $dbgfile (@ARGV) {
    next unless -f $dbgfile;
    # get filename without path or .pdb extension, if it exists
    my ($sf) = fileparse($dbgfile, ".pdb");
    my $symfile = $symbol_path . "/" . $sf . ".sym";
    foreach my $arch (@archs) {
      my $a = '';
      $a = "-a $arch" if $arch ne '';
      system("${dump_syms} ${a} ${dbgfile} > ${symfile}");
      my $newpath = rename_symbol_file $symfile, $symbol_path;
      if ($copy_dbg && $newpath ne "") {
        my $out = $newpath;
        $out =~ s/^$symbol_path//;
        $out =~ s|^/||;
        print "$out/${sf}.pdb\n";
        copy($dbgfile, $newpath);
      }
    }
}
